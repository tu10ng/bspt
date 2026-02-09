"""VRP session state machine.

Manages view states (User/System/Interface) and hostname.
"""

from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional, List


class ViewType(Enum):
    """VRP CLI view types."""
    USER = auto()       # User view: <Huawei>
    SYSTEM = auto()     # System view: [Huawei]
    INTERFACE = auto()  # Interface view: [Huawei-GigabitEthernet0/0/1]
    AAA = auto()        # AAA view: [Huawei-aaa]
    ACL = auto()        # ACL view: [Huawei-acl-basic-2000]
    VLAN = auto()       # VLAN view: [Huawei-vlan10]


@dataclass
class ViewState:
    """Current view state with context."""
    view_type: ViewType
    context: Optional[str] = None  # e.g., interface name, ACL number


@dataclass
class VRPSession:
    """VRP session state machine."""

    hostname: str = "Huawei"
    screen_length: int = 24
    screen_length_temporary: bool = False
    view_stack: List[ViewState] = field(default_factory=lambda: [ViewState(ViewType.USER)])

    @property
    def current_view(self) -> ViewState:
        """Get current view."""
        return self.view_stack[-1]

    @property
    def prompt(self) -> str:
        """Generate current prompt based on view state."""
        view = self.current_view

        if view.view_type == ViewType.USER:
            return f"<{self.hostname}>"
        elif view.view_type == ViewType.SYSTEM:
            return f"[{self.hostname}]"
        elif view.view_type == ViewType.INTERFACE:
            return f"[{self.hostname}-{view.context}]"
        elif view.view_type == ViewType.AAA:
            return f"[{self.hostname}-aaa]"
        elif view.view_type == ViewType.ACL:
            return f"[{self.hostname}-{view.context}]"
        elif view.view_type == ViewType.VLAN:
            return f"[{self.hostname}-{view.context}]"
        else:
            return f"<{self.hostname}>"

    def enter_system_view(self) -> str:
        """Enter system view from user view."""
        if self.current_view.view_type != ViewType.USER:
            return "Error: Already in configuration mode"

        self.view_stack.append(ViewState(ViewType.SYSTEM))
        return "Enter system view, return user view with Ctrl+Z."

    def enter_interface(self, interface_name: str) -> str:
        """Enter interface configuration view."""
        if self.current_view.view_type not in (ViewType.SYSTEM, ViewType.INTERFACE):
            return "Error: Please enter system view first"

        # Normalize interface name
        normalized = self._normalize_interface_name(interface_name)
        if not normalized:
            return f"Error: Unrecognized interface type '{interface_name}'"

        self.view_stack.append(ViewState(ViewType.INTERFACE, normalized))
        return ""

    def enter_aaa(self) -> str:
        """Enter AAA configuration view."""
        if self.current_view.view_type != ViewType.SYSTEM:
            return "Error: Please enter system view first"

        self.view_stack.append(ViewState(ViewType.AAA))
        return ""

    def quit_view(self) -> str:
        """Quit current view, return to parent."""
        if len(self.view_stack) <= 1:
            # At user view, logout
            return "LOGOUT"

        self.view_stack.pop()
        return ""

    def return_to_user(self) -> None:
        """Return directly to user view (Ctrl+Z behavior)."""
        self.view_stack = [ViewState(ViewType.USER)]

    def set_hostname(self, name: str) -> str:
        """Set system hostname."""
        if self.current_view.view_type != ViewType.SYSTEM:
            return "Error: Please enter system view first"

        if not name or len(name) > 64:
            return "Error: Invalid hostname"

        self.hostname = name
        return ""

    def set_screen_length(self, length: int, temporary: bool = False) -> str:
        """Set terminal screen length for pagination."""
        if length < 0 or length > 512:
            return "Error: Invalid screen-length value (0-512)"

        self.screen_length = length
        self.screen_length_temporary = temporary
        return ""

    @staticmethod
    def _normalize_interface_name(name: str) -> Optional[str]:
        """Normalize interface name with abbreviation support."""
        name_lower = name.lower()

        # Common interface type mappings
        type_map = {
            'gi': 'GigabitEthernet',
            'gig': 'GigabitEthernet',
            'gigabitethernet': 'GigabitEthernet',
            'eth': 'Ethernet',
            'ethernet': 'Ethernet',
            'xgi': 'XGigabitEthernet',
            'xgigabitethernet': 'XGigabitEthernet',
            'lo': 'LoopBack',
            'loopback': 'LoopBack',
            'null': 'NULL',
            'vlan': 'Vlanif',
            'vlanif': 'Vlanif',
            'me': 'MEth',
            'meth': 'MEth',
        }

        # Try to match prefix
        for abbrev, full_name in type_map.items():
            if name_lower.startswith(abbrev):
                suffix = name[len(abbrev):]
                if suffix:
                    return f"{full_name}{suffix}"
                return full_name

        # If no match, check if it looks like a valid interface
        if '/' in name:
            return name

        return None
