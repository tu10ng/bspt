use std::collections::VecDeque;
use tokio::sync::mpsc;
use tracing::debug;

/// Default buffer capacity: 256KB
const DEFAULT_CAPACITY: usize = 256 * 1024;

/// High watermark: 80% of capacity - pause reading when reached
const DEFAULT_WATERMARK_HIGH_PERCENT: usize = 80;

/// Low watermark: 20% of capacity - resume reading when drained to this level
const DEFAULT_WATERMARK_LOW_PERCENT: usize = 20;

/// Ring buffer with watermark-based backpressure for session data.
///
/// This buffer sits between the TCP/SSH read loop and Tauri event emission
/// to prevent the frontend from being overwhelmed during high-throughput
/// scenarios (e.g., 100k+ lines of output).
///
/// Flow control:
/// 1. Data arrives from network -> push to buffer
/// 2. If buffer exceeds high watermark -> pause network reads
/// 3. Frontend processes data -> calls drain notification
/// 4. If buffer drops below low watermark -> resume network reads
pub struct SessionRingBuffer {
    buffer: VecDeque<u8>,
    capacity: usize,
    watermark_high: usize,
    watermark_low: usize,
    session_id: String,
}

impl SessionRingBuffer {
    /// Create a new ring buffer with default capacity (256KB).
    pub fn new(session_id: String) -> Self {
        Self::with_capacity(session_id, DEFAULT_CAPACITY)
    }

    /// Create a new ring buffer with specified capacity.
    pub fn with_capacity(session_id: String, capacity: usize) -> Self {
        let watermark_high = capacity * DEFAULT_WATERMARK_HIGH_PERCENT / 100;
        let watermark_low = capacity * DEFAULT_WATERMARK_LOW_PERCENT / 100;

        Self {
            buffer: VecDeque::with_capacity(capacity),
            capacity,
            watermark_high,
            watermark_low,
            session_id,
        }
    }

    /// Push data into the buffer.
    ///
    /// Returns `true` if data was accepted, `false` if buffer is at capacity
    /// (data is still pushed, but older data may be dropped in extreme cases).
    pub fn push(&mut self, data: &[u8]) -> bool {
        // If adding this data would exceed capacity, we're at backpressure
        let will_exceed = self.buffer.len() + data.len() > self.capacity;

        if will_exceed {
            debug!(
                session_id = %self.session_id,
                buffer_len = self.buffer.len(),
                incoming = data.len(),
                capacity = self.capacity,
                "Buffer at capacity, data may be delayed"
            );
        }

        // Always accept data, but signal backpressure
        self.buffer.extend(data);

        !will_exceed
    }

    /// Pop a chunk of data from the buffer.
    ///
    /// Returns up to `max_size` bytes, or None if buffer is empty.
    pub fn pop_chunk(&mut self, max_size: usize) -> Option<Vec<u8>> {
        if self.buffer.is_empty() {
            return None;
        }

        let drain_size = max_size.min(self.buffer.len());
        let chunk: Vec<u8> = self.buffer.drain(..drain_size).collect();

        Some(chunk)
    }

    /// Drain all data from the buffer.
    pub fn drain_all(&mut self) -> Vec<u8> {
        self.buffer.drain(..).collect()
    }

    /// Check if reading should be paused (buffer above high watermark).
    pub fn should_pause(&self) -> bool {
        self.buffer.len() >= self.watermark_high
    }

    /// Check if reading can resume (buffer below low watermark).
    pub fn can_resume(&self) -> bool {
        self.buffer.len() <= self.watermark_low
    }

    /// Get current buffer length.
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    /// Check if buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Get buffer fill percentage (0-100).
    pub fn fill_percent(&self) -> usize {
        (self.buffer.len() * 100) / self.capacity
    }
}

/// Backpressure controller that manages the flow between network reads
/// and frontend consumption.
pub struct BackpressureController {
    /// Channel to signal pause/resume to the read loop
    pause_tx: mpsc::Sender<bool>,
    /// Current pause state
    is_paused: bool,
    session_id: String,
}

impl BackpressureController {
    pub fn new(session_id: String, pause_tx: mpsc::Sender<bool>) -> Self {
        Self {
            pause_tx,
            is_paused: false,
            session_id,
        }
    }

    /// Update backpressure state based on buffer level.
    /// Returns true if state changed.
    pub async fn update(&mut self, buffer: &SessionRingBuffer) -> bool {
        let should_pause = buffer.should_pause();
        let can_resume = buffer.can_resume();

        if !self.is_paused && should_pause {
            // Need to pause
            self.is_paused = true;
            debug!(
                session_id = %self.session_id,
                buffer_fill = %buffer.fill_percent(),
                "Backpressure: pausing reads"
            );
            let _ = self.pause_tx.send(true).await;
            return true;
        }

        if self.is_paused && can_resume {
            // Can resume
            self.is_paused = false;
            debug!(
                session_id = %self.session_id,
                buffer_fill = %buffer.fill_percent(),
                "Backpressure: resuming reads"
            );
            let _ = self.pause_tx.send(false).await;
            return true;
        }

        false
    }

    /// Check if currently paused.
    pub fn is_paused(&self) -> bool {
        self.is_paused
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_push_pop() {
        let mut buffer = SessionRingBuffer::with_capacity("test".to_string(), 1024);

        buffer.push(b"hello");
        assert_eq!(buffer.len(), 5);

        let chunk = buffer.pop_chunk(3);
        assert_eq!(chunk, Some(vec![b'h', b'e', b'l']));
        assert_eq!(buffer.len(), 2);

        let chunk = buffer.pop_chunk(10);
        assert_eq!(chunk, Some(vec![b'l', b'o']));
        assert!(buffer.is_empty());
    }

    #[test]
    fn test_watermarks() {
        let mut buffer = SessionRingBuffer::with_capacity("test".to_string(), 100);

        // Low watermark = 20, High watermark = 80
        assert!(!buffer.should_pause());
        assert!(buffer.can_resume());

        // Fill to 50% - no pause yet
        buffer.push(&[0u8; 50]);
        assert!(!buffer.should_pause());
        assert!(!buffer.can_resume());

        // Fill to 80% - should pause
        buffer.push(&[0u8; 30]);
        assert!(buffer.should_pause());
        assert!(!buffer.can_resume());

        // Drain to 30% - still paused (hysteresis)
        buffer.pop_chunk(50);
        assert!(!buffer.should_pause());
        assert!(!buffer.can_resume());

        // Drain to 20% - can resume
        buffer.pop_chunk(10);
        assert!(buffer.can_resume());
    }

    #[test]
    fn test_drain_all() {
        let mut buffer = SessionRingBuffer::with_capacity("test".to_string(), 1024);
        buffer.push(b"test data");

        let data = buffer.drain_all();
        assert_eq!(data, b"test data");
        assert!(buffer.is_empty());
    }
}
