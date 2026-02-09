"""Pagination handler for VRP "---- More ----" output.

Implements screen-length based pagination with Space/Enter/q handling.
"""

from typing import Tuple, Optional, List
from dataclasses import dataclass
from enum import Enum, auto


class PaginationState(Enum):
    """Current pagination state."""
    IDLE = auto()           # Not paginating
    WAITING = auto()        # Showing "---- More ----", waiting for input
    COMPLETE = auto()       # All content shown


@dataclass
class PaginationContext:
    """Context for paginated output."""
    lines: List[str]
    current_line: int = 0
    screen_length: int = 24

    @property
    def remaining_lines(self) -> int:
        """Number of lines remaining to show."""
        return len(self.lines) - self.current_line

    @property
    def is_complete(self) -> bool:
        """Check if all lines have been shown."""
        return self.current_line >= len(self.lines)


class PaginationHandler:
    """Handles paginated output with "---- More ----" prompts."""

    MORE_PROMPT = "  ---- More ----"

    def __init__(self):
        self._context: Optional[PaginationContext] = None
        self._state = PaginationState.IDLE

    @property
    def is_paginating(self) -> bool:
        """Check if currently in pagination mode."""
        return self._state == PaginationState.WAITING

    def start_pagination(self, content: str, screen_length: int) -> Tuple[str, bool]:
        """Start paginating content.

        Args:
            content: Full output content
            screen_length: Number of lines per page (0 = no pagination)

        Returns:
            (output_text, needs_more) - Text to send and whether More prompt needed
        """
        if screen_length == 0:
            # No pagination
            return content, False

        lines = content.split('\n')

        # Reserve 1 line for "More" prompt, 1 for command
        effective_length = screen_length - 2
        if effective_length < 1:
            effective_length = 1

        if len(lines) <= effective_length:
            # Content fits on one screen
            return content, False

        # Need pagination
        self._context = PaginationContext(
            lines=lines,
            current_line=0,
            screen_length=effective_length
        )

        return self._next_page()

    def handle_input(self, char: bytes) -> Tuple[str, bool]:
        """Handle user input during pagination.

        Args:
            char: Input character

        Returns:
            (output_text, needs_more) - Next output and whether to continue
        """
        if not self.is_paginating or not self._context:
            return "", False

        # Clear the "More" prompt line
        clear_line = "\r" + " " * len(self.MORE_PROMPT) + "\r"

        if char in (b' ', b'\x20'):
            # Space - next page
            output, needs_more = self._next_page()
            return clear_line + output, needs_more

        elif char in (b'\r', b'\n'):
            # Enter - next line
            output, needs_more = self._next_line()
            return clear_line + output, needs_more

        elif char in (b'q', b'Q', b'\x03'):
            # q or Ctrl+C - abort
            self._reset()
            return clear_line, False

        else:
            # Unknown input, show help hint briefly then restore More
            return "", True

    def _next_page(self) -> Tuple[str, bool]:
        """Get next page of content."""
        if not self._context:
            return "", False

        ctx = self._context
        end_line = min(ctx.current_line + ctx.screen_length, len(ctx.lines))

        output_lines = ctx.lines[ctx.current_line:end_line]
        ctx.current_line = end_line

        if ctx.is_complete:
            self._reset()
            return '\n'.join(output_lines), False

        self._state = PaginationState.WAITING
        return '\n'.join(output_lines) + '\n' + self.MORE_PROMPT, True

    def _next_line(self) -> Tuple[str, bool]:
        """Get next single line of content."""
        if not self._context:
            return "", False

        ctx = self._context

        if ctx.current_line >= len(ctx.lines):
            self._reset()
            return "", False

        output = ctx.lines[ctx.current_line]
        ctx.current_line += 1

        if ctx.is_complete:
            self._reset()
            return output, False

        self._state = PaginationState.WAITING
        return output + '\n' + self.MORE_PROMPT, True

    def _reset(self):
        """Reset pagination state."""
        self._context = None
        self._state = PaginationState.IDLE

    def abort(self):
        """Abort current pagination."""
        self._reset()
