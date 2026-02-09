use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

/// VRP view modes (command prompt types)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VrpView {
    User,       // <Huawei>
    System,     // [Huawei]
    Interface,  // [Huawei-GigabitEthernet0/0/1]
    Unknown,
}

/// Events detected during VRP stream parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VrpEvent {
    ViewChange {
        view: VrpView,
        hostname: String,
    },
    Pagination {
        detected: bool,
        auto_handled: bool,
    },
    BoardInfo(BoardInfo),
}

/// Parsed board information from `display device`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardInfo {
    pub slot_id: String,
    pub sub_slot: String,
    pub board_type: String,
    pub status: String,
    pub ip: Option<String>,
}

// Regex patterns compiled once
static PAGINATION_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"----\s*More\s*----").unwrap());

static USER_VIEW_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<([^>]+)>\s*$").unwrap());

static SYSTEM_VIEW_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\s*$").unwrap());

// Board parsing from `display device` output
// Format: Slot Sub  Type    Status  Primary  IP
// Example: 0    -    SRUC    Present Master   192.168.1.1
static BOARD_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(\d+)\s+(-|\d+)\s+(\S+)\s+(Present|Absent|Offline|Online|Registering)\s*(?:\S+\s+)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})?"
    ).unwrap()
});

/// VRP stream parser for handling Huawei router-specific output
pub struct VrpParser {
    /// Buffer for accumulating partial lines
    line_buffer: String,
    /// Current detected view
    current_view: VrpView,
    /// Current hostname
    hostname: String,
    /// Auto-handle pagination (send space)
    pub auto_pagination: bool,
}

impl Default for VrpParser {
    fn default() -> Self {
        Self::new()
    }
}

impl VrpParser {
    pub fn new() -> Self {
        Self {
            line_buffer: String::new(),
            current_view: VrpView::Unknown,
            hostname: String::new(),
            auto_pagination: true,
        }
    }

    /// Parse incoming data and return (cleaned_data, events, auto_response)
    /// auto_response contains bytes to send back automatically (e.g., space for pagination)
    pub fn parse(&mut self, data: &[u8]) -> (Vec<u8>, Vec<VrpEvent>, Option<Vec<u8>>) {
        let mut events = Vec::new();
        let mut auto_response = None;

        // Convert to string, handling incomplete UTF-8 gracefully
        let text = String::from_utf8_lossy(data);
        self.line_buffer.push_str(&text);

        // Check for pagination
        if PAGINATION_RE.is_match(&self.line_buffer) {
            let handled = self.auto_pagination;
            events.push(VrpEvent::Pagination {
                detected: true,
                auto_handled: handled,
            });

            if handled {
                // Send space to continue
                auto_response = Some(b" ".to_vec());
            }

            // Remove the pagination marker from buffer
            self.line_buffer = PAGINATION_RE.replace_all(&self.line_buffer, "").to_string();
        }

        // Check for view changes (prompt detection)
        if let Some(view_event) = self.detect_view_change() {
            events.push(view_event);
        }

        // Parse board information if present
        for board in self.parse_boards() {
            events.push(VrpEvent::BoardInfo(board));
        }

        // Clean the line buffer - keep only the last line if incomplete
        if let Some(last_newline) = self.line_buffer.rfind('\n') {
            self.line_buffer = self.line_buffer[last_newline + 1..].to_string();
        }

        // Return original data (we don't filter it, just detect events)
        (data.to_vec(), events, auto_response)
    }

    fn detect_view_change(&mut self) -> Option<VrpEvent> {
        // Check for user view prompt: <hostname>
        if let Some(caps) = USER_VIEW_RE.captures(&self.line_buffer) {
            let hostname = caps.get(1)?.as_str().to_string();
            if self.current_view != VrpView::User || self.hostname != hostname {
                self.current_view = VrpView::User;
                self.hostname = hostname.clone();
                return Some(VrpEvent::ViewChange {
                    view: VrpView::User,
                    hostname,
                });
            }
        }
        // Check for system/interface view prompt: [hostname] or [hostname-interface]
        else if let Some(caps) = SYSTEM_VIEW_RE.captures(&self.line_buffer) {
            let full_prompt = caps.get(1)?.as_str();
            // Detect if it's an interface view (contains hyphen after hostname)
            let (view, hostname) = if full_prompt.contains('-') {
                // Interface view: [Huawei-GigabitEthernet0/0/1]
                let hostname = full_prompt.split('-').next()?.to_string();
                (VrpView::Interface, hostname)
            } else {
                // System view: [Huawei]
                (VrpView::System, full_prompt.to_string())
            };

            if self.current_view != view || self.hostname != hostname {
                self.current_view = view;
                self.hostname = hostname.clone();
                return Some(VrpEvent::ViewChange {
                    view,
                    hostname,
                });
            }
        }

        None
    }

    fn parse_boards(&self) -> Vec<BoardInfo> {
        let mut boards = Vec::new();

        for line in self.line_buffer.lines() {
            if let Some(caps) = BOARD_RE.captures(line) {
                let slot_id = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                let sub_slot = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
                let board_type = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
                let status = caps.get(4).map(|m| m.as_str().to_string()).unwrap_or_default();
                let ip = caps.get(5).map(|m| m.as_str().to_string());

                boards.push(BoardInfo {
                    slot_id,
                    sub_slot,
                    board_type,
                    status,
                    ip,
                });
            }
        }

        boards
    }

    /// Get current VRP view
    #[allow(dead_code)]
    pub fn current_view(&self) -> VrpView {
        self.current_view
    }

    /// Get current hostname
    #[allow(dead_code)]
    pub fn hostname(&self) -> &str {
        &self.hostname
    }

    /// Reset parser state
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.line_buffer.clear();
        self.current_view = VrpView::Unknown;
        self.hostname.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pagination_detection() {
        let mut parser = VrpParser::new();
        let data = b"Some output\r\n  ---- More ----";
        let (_, events, auto) = parser.parse(data);

        assert!(events.iter().any(|e| matches!(e, VrpEvent::Pagination { detected: true, .. })));
        assert!(auto.is_some());
        assert_eq!(auto.unwrap(), b" ");
    }

    #[test]
    fn test_user_view_detection() {
        let mut parser = VrpParser::new();
        let data = b"<Huawei>";
        let (_, events, _) = parser.parse(data);

        assert!(events.iter().any(|e| matches!(
            e,
            VrpEvent::ViewChange { view: VrpView::User, hostname } if hostname == "Huawei"
        )));
    }

    #[test]
    fn test_system_view_detection() {
        let mut parser = VrpParser::new();
        let data = b"[Huawei]";
        let (_, events, _) = parser.parse(data);

        assert!(events.iter().any(|e| matches!(
            e,
            VrpEvent::ViewChange { view: VrpView::System, hostname } if hostname == "Huawei"
        )));
    }

    #[test]
    fn test_interface_view_detection() {
        let mut parser = VrpParser::new();
        let data = b"[Huawei-GigabitEthernet0/0/1]";
        let (_, events, _) = parser.parse(data);

        assert!(events.iter().any(|e| matches!(
            e,
            VrpEvent::ViewChange { view: VrpView::Interface, hostname } if hostname == "Huawei"
        )));
    }

    #[test]
    fn test_board_parsing() {
        let mut parser = VrpParser::new();
        let data = b"0    -    SRUC    Present Master   192.168.1.1\r\n1    0    LPU     Present Slave    10.0.0.1\r\n";
        let (_, events, _) = parser.parse(data);

        let boards: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                VrpEvent::BoardInfo(b) => Some(b),
                _ => None,
            })
            .collect();

        assert_eq!(boards.len(), 2);
        assert_eq!(boards[0].slot_id, "0");
        assert_eq!(boards[0].ip, Some("192.168.1.1".to_string()));
        assert_eq!(boards[1].slot_id, "1");
    }
}
