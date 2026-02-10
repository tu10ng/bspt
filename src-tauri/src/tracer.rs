//! Log Tracer - Maps log output back to source code locations
//!
//! Uses tree-sitter to parse C source files and extract printf/log format strings,
//! then uses AhoCorasick for efficient multi-pattern matching against log output.

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::LazyLock;
use thiserror::Error;
use tracing::{debug, info, warn};
use tree_sitter::{Language, Parser, Query, QueryCursor};
use walkdir::WalkDir;

extern "C" {
    fn tree_sitter_c() -> Language;
}

#[derive(Error, Debug)]
pub enum TracerError {
    #[error("Failed to parse file: {0}")]
    ParseError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Tree-sitter error: {0}")]
    TreeSitterError(String),
    #[error("Tracer not indexed")]
    NotIndexed,
}

/// Source location information for a log format string
#[derive(Debug, Clone, Serialize)]
pub struct SourceLocation {
    pub file: String,
    pub line: u32,
    pub function: String,
    pub format_string: String,
}

/// Statistics about indexing operation
#[derive(Debug, Clone, Serialize)]
pub struct IndexStats {
    pub files_scanned: u32,
    pub patterns_indexed: u32,
    pub duration_ms: u64,
}

/// Current tracer status
#[derive(Debug, Clone, Serialize)]
pub struct TracerStats {
    pub indexed: bool,
    pub pattern_count: usize,
    pub source_path: Option<String>,
}

/// Pattern entry for building AhoCorasick automaton
struct PatternEntry {
    pattern: String,
    location: SourceLocation,
}

/// Log tracer that maps log output to source code locations
pub struct LogTracer {
    /// Index mapping normalized patterns to source locations
    index: HashMap<String, SourceLocation>,
    /// AhoCorasick automaton for efficient multi-pattern matching
    matcher: Option<AhoCorasick>,
    /// Ordered patterns for matcher index lookup
    patterns: Vec<String>,
    /// Source directory that was indexed
    source_path: Option<String>,
}

/// Regex for format specifiers like %d, %s, %x, etc.
static FORMAT_SPEC_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"%[-+0 #]*\d*\.?\d*[hlLzjt]*[diouxXeEfFgGaAcspn%]").unwrap()
});

/// Regex for escape sequences
static ESCAPE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\[nrtv\\0]").unwrap()
});

impl LogTracer {
    pub fn new() -> Self {
        Self {
            index: HashMap::new(),
            matcher: None,
            patterns: Vec::new(),
            source_path: None,
        }
    }

    /// Index a directory of C source files
    ///
    /// Walks directory recursively, parses .c/.h files with tree-sitter,
    /// extracts printf/log format strings and their locations
    pub fn index_directory(&mut self, path: &Path) -> Result<IndexStats, TracerError> {
        let start = std::time::Instant::now();
        let mut files_scanned = 0u32;
        let mut pattern_entries: Vec<PatternEntry> = Vec::new();

        // Clear previous index
        self.index.clear();
        self.patterns.clear();
        self.matcher = None;

        // Create tree-sitter parser
        let mut parser = Parser::new();
        let language = unsafe { tree_sitter_c() };
        parser
            .set_language(&language)
            .map_err(|e| TracerError::TreeSitterError(e.to_string()))?;

        // Query for printf-like function calls with string literal arguments
        // This matches: printf("..."), fprintf(stderr, "..."), log_xxx("..."), etc.
        let query_str = r#"
            (call_expression
                function: [
                    (identifier) @func
                    (field_expression field: (field_identifier) @func)
                ]
                arguments: (argument_list
                    (string_literal) @format_string))
        "#;

        let query = Query::new(&language, query_str)
            .map_err(|e| TracerError::TreeSitterError(e.to_string()))?;

        let func_idx = query
            .capture_index_for_name("func")
            .ok_or_else(|| TracerError::TreeSitterError("No func capture".to_string()))?;
        let format_idx = query
            .capture_index_for_name("format_string")
            .ok_or_else(|| TracerError::TreeSitterError("No format_string capture".to_string()))?;

        // Walk directory for .c and .h files
        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let file_path = entry.path();
            if !file_path.is_file() {
                continue;
            }

            let extension = file_path.extension().and_then(|e| e.to_str());
            if extension != Some("c") && extension != Some("h") {
                continue;
            }

            // Read and parse file
            let source = match std::fs::read_to_string(file_path) {
                Ok(s) => s,
                Err(e) => {
                    warn!(file = ?file_path, error = %e, "Failed to read file");
                    continue;
                }
            };

            let tree = match parser.parse(&source, None) {
                Some(t) => t,
                None => {
                    warn!(file = ?file_path, "Failed to parse file");
                    continue;
                }
            };

            files_scanned += 1;

            // Extract format strings
            let mut cursor = QueryCursor::new();
            let matches = cursor.matches(&query, tree.root_node(), source.as_bytes());

            for m in matches {
                let mut func_name = String::new();
                let mut format_string = String::new();
                let mut line = 0u32;

                for capture in m.captures {
                    if capture.index == func_idx {
                        func_name = source[capture.node.byte_range()].to_string();
                    } else if capture.index == format_idx {
                        let raw = &source[capture.node.byte_range()];
                        // Remove quotes from string literal
                        format_string = raw.trim_matches('"').to_string();
                        line = capture.node.start_position().row as u32 + 1;
                    }
                }

                // Filter for logging/printf-like functions
                if !is_log_function(&func_name) {
                    continue;
                }

                // Skip empty or very short format strings
                if format_string.len() < 3 {
                    continue;
                }

                let location = SourceLocation {
                    file: file_path.to_string_lossy().to_string(),
                    line,
                    function: func_name,
                    format_string: format_string.clone(),
                };

                // Normalize format string for matching
                let normalized = normalize_format_string(&format_string);
                if normalized.len() >= 5 {
                    pattern_entries.push(PatternEntry {
                        pattern: normalized,
                        location,
                    });
                }
            }
        }

        // Build AhoCorasick automaton
        if !pattern_entries.is_empty() {
            let patterns: Vec<String> = pattern_entries.iter().map(|e| e.pattern.clone()).collect();

            // Store patterns for index lookup
            self.patterns = patterns.clone();

            // Build index
            for entry in &pattern_entries {
                self.index
                    .insert(entry.pattern.clone(), entry.location.clone());
            }

            // Build automaton with leftmost-longest matching
            let automaton = AhoCorasickBuilder::new()
                .match_kind(MatchKind::LeftmostLongest)
                .build(&patterns)
                .map_err(|e| TracerError::TreeSitterError(e.to_string()))?;

            self.matcher = Some(automaton);
        }

        self.source_path = Some(path.to_string_lossy().to_string());

        let duration = start.elapsed();
        let stats = IndexStats {
            files_scanned,
            patterns_indexed: pattern_entries.len() as u32,
            duration_ms: duration.as_millis() as u64,
        };

        info!(
            files = files_scanned,
            patterns = pattern_entries.len(),
            duration_ms = stats.duration_ms,
            "Indexing complete"
        );

        Ok(stats)
    }

    /// Match a log line against indexed patterns
    ///
    /// Returns the SourceLocation if a match is found
    pub fn match_log(&self, log_line: &str) -> Option<&SourceLocation> {
        let matcher = self.matcher.as_ref()?;

        // Find all matches in the log line
        for mat in matcher.find_iter(log_line) {
            let pattern = &self.patterns[mat.pattern().as_usize()];
            if let Some(location) = self.index.get(pattern) {
                debug!(
                    pattern = pattern,
                    file = &location.file,
                    line = location.line,
                    "Log matched"
                );
                return Some(location);
            }
        }

        None
    }

    /// Get the number of indexed patterns
    pub fn get_indexed_count(&self) -> usize {
        self.index.len()
    }

    /// Check if the tracer has been indexed
    pub fn is_indexed(&self) -> bool {
        self.matcher.is_some()
    }

    /// Get current tracer statistics
    pub fn get_stats(&self) -> TracerStats {
        TracerStats {
            indexed: self.is_indexed(),
            pattern_count: self.index.len(),
            source_path: self.source_path.clone(),
        }
    }
}

impl Default for LogTracer {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if a function name is a logging/printf-like function
fn is_log_function(name: &str) -> bool {
    let name_lower = name.to_lowercase();

    // Standard printf family
    if matches!(
        name_lower.as_str(),
        "printf" | "fprintf" | "sprintf" | "snprintf" | "vprintf" | "vfprintf"
    ) {
        return true;
    }

    // Common logging patterns
    let log_prefixes = [
        "log_", "log", "trace_", "trace", "dbg_", "dbg", "debug_", "debug", "info_", "info",
        "warn_", "warn", "warning_", "warning", "err_", "err", "error_", "error", "fatal_", "fatal",
        "print_", "printk", "pr_",
    ];

    for prefix in log_prefixes {
        if name_lower.starts_with(prefix) {
            return true;
        }
    }

    // Common logging macros (uppercase)
    let log_macros = [
        "LOG", "TRACE", "DBG", "DEBUG", "INFO", "WARN", "WARNING", "ERR", "ERROR", "FATAL",
        "ASSERT", "PRINT", "PRINTK", "PR_", "LOG_",
    ];

    for macro_name in log_macros {
        if name.starts_with(macro_name) {
            return true;
        }
    }

    false
}

/// Normalize a format string for matching
///
/// - Replaces format specifiers (%d, %s, etc.) with a wildcard marker
/// - Handles escape sequences
/// - Extracts static prefix for efficient matching
fn normalize_format_string(format_str: &str) -> String {
    // Handle escape sequences
    let unescaped = ESCAPE_RE.replace_all(format_str, " ");

    // Replace format specifiers with a common marker
    // We use space as a wildcard since logs often have spaces between values
    let normalized = FORMAT_SPEC_RE.replace_all(&unescaped, " ");

    // Collapse multiple spaces and trim
    let collapsed: String = normalized
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    collapsed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_log_function() {
        assert!(is_log_function("printf"));
        assert!(is_log_function("fprintf"));
        assert!(is_log_function("log_info"));
        assert!(is_log_function("LOG_ERROR"));
        assert!(is_log_function("TRACE"));
        assert!(is_log_function("pr_debug"));
        assert!(!is_log_function("malloc"));
        assert!(!is_log_function("strcpy"));
    }

    #[test]
    fn test_normalize_format_string() {
        assert_eq!(
            normalize_format_string("Hello %s, value is %d"),
            "Hello , value is"
        );
        assert_eq!(
            normalize_format_string("Error: %s\\n"),
            "Error:"
        );
        assert_eq!(
            normalize_format_string("[%s:%d] Connection from %s"),
            "[ : ] Connection from"
        );
    }
}
