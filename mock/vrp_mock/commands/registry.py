"""Command registry and dispatcher with abbreviation support."""

import re
from typing import Callable, Optional, List, Tuple, Dict, Any
from dataclasses import dataclass
from ..session import VRPSession, ViewType


@dataclass
class CommandMatch:
    """Result of command matching."""
    handler: Callable
    args: Dict[str, Any]
    pattern: str


class CommandRegistry:
    """Registry for VRP commands with pattern matching and abbreviation support."""

    def __init__(self):
        self._commands: List[Tuple[re.Pattern, Callable, List[ViewType]]] = []
        self._abbreviations: Dict[str, str] = {}
        self._setup_abbreviations()

    def _setup_abbreviations(self):
        """Setup common VRP command abbreviations."""
        self._abbreviations = {
            # display commands
            'dis': 'display',
            'd': 'display',
            'sh': 'display',  # Cisco habit
            'show': 'display',

            # system commands
            'sys': 'system-view',
            'sy': 'system-view',
            'q': 'quit',
            'qui': 'quit',

            # display subcommands
            'ver': 'version',
            'dev': 'device',
            'int': 'interface',
            'cur': 'current-configuration',
            'conf': 'configuration',
            'ip': 'ip',
            'br': 'brief',
            'bri': 'brief',

            # interface commands
            'gi': 'GigabitEthernet',
            'gig': 'GigabitEthernet',
            'lo': 'LoopBack',
            'eth': 'Ethernet',

            # config commands
            'sysn': 'sysname',
            'scr': 'screen-length',
        }

    def expand_abbreviations(self, command: str) -> str:
        """Expand command abbreviations to full form."""
        parts = command.split()
        expanded = []

        for part in parts:
            lower_part = part.lower()
            if lower_part in self._abbreviations:
                expanded.append(self._abbreviations[lower_part])
            else:
                expanded.append(part)

        return ' '.join(expanded)

    def register(
        self,
        pattern: str,
        handler: Callable,
        views: Optional[List[ViewType]] = None
    ):
        """Register a command handler.

        Args:
            pattern: Regex pattern to match command
            handler: Function to handle command (session, match) -> str
            views: List of views where command is valid (None = all)
        """
        compiled = re.compile(pattern, re.IGNORECASE)
        allowed_views = views if views else list(ViewType)
        self._commands.append((compiled, handler, allowed_views))

    def match(self, command: str, session: VRPSession) -> Optional[CommandMatch]:
        """Find matching command handler.

        Args:
            command: Raw command input
            session: Current session state

        Returns:
            CommandMatch if found, None otherwise
        """
        # Expand abbreviations first
        expanded = self.expand_abbreviations(command.strip())

        current_view = session.current_view.view_type

        for pattern, handler, allowed_views in self._commands:
            if current_view not in allowed_views:
                continue

            match = pattern.match(expanded)
            if match:
                return CommandMatch(
                    handler=handler,
                    args=match.groupdict(),
                    pattern=pattern.pattern
                )

        return None

    def execute(self, command: str, session: VRPSession) -> Optional[str]:
        """Execute a command if it matches.

        Args:
            command: Raw command input
            session: Current session state

        Returns:
            Command output string, or None if no match
        """
        result = self.match(command, session)
        if result:
            return result.handler(session, **result.args)
        return None
