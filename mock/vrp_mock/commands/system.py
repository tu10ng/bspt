"""System and configuration command handlers."""

from ..session import VRPSession, ViewType
from .registry import CommandRegistry


def _system_view(session: VRPSession) -> str:
    """Handle 'system-view' command."""
    return session.enter_system_view()


def _quit(session: VRPSession) -> str:
    """Handle 'quit' command."""
    return session.quit_view()


def _return_cmd(session: VRPSession) -> str:
    """Handle 'return' command - return to user view."""
    session.return_to_user()
    return ""


def _sysname(session: VRPSession, name: str) -> str:
    """Handle 'sysname <name>' command."""
    return session.set_hostname(name)


def _screen_length(session: VRPSession, length: str, temporary: str = None) -> str:
    """Handle 'screen-length <n> [temporary]' command."""
    try:
        length_int = int(length)
    except ValueError:
        return "Error: Invalid screen-length value"

    return session.set_screen_length(length_int, temporary is not None)


def _interface(session: VRPSession, name: str) -> str:
    """Handle 'interface <name>' command."""
    return session.enter_interface(name)


def _undo(session: VRPSession, command: str) -> str:
    """Handle 'undo <command>' - generic undo handler."""
    # Just acknowledge for now
    return ""


def _save(session: VRPSession, filename: str = None) -> str:
    """Handle 'save [filename]' command."""
    fname = filename if filename else "vrpcfg.zip"
    return f"""The current configuration will be written to the device.
Are you sure to continue?[Y/N]:y
Now saving the current configuration to the slot 0....
Save the configuration successfully."""


def _reboot(session: VRPSession) -> str:
    """Handle 'reboot' command."""
    return """Info: The system is comparing the configuration, please wait.
Warning: All the configuration will be saved to the next startup configuration.
Continue?[Y/N]:"""


def _ping(session: VRPSession, host: str) -> str:
    """Handle 'ping <host>' command."""
    return f"""  PING {host}: 56  data bytes, press CTRL_C to break
    Reply from {host}: bytes=56 Sequence=1 ttl=255 time=1 ms
    Reply from {host}: bytes=56 Sequence=2 ttl=255 time=1 ms
    Reply from {host}: bytes=56 Sequence=3 ttl=255 time=1 ms
    Reply from {host}: bytes=56 Sequence=4 ttl=255 time=1 ms
    Reply from {host}: bytes=56 Sequence=5 ttl=255 time=1 ms

  --- {host} ping statistics ---
    5 packet(s) transmitted
    5 packet(s) received
    0.00% packet loss
    round-trip min/avg/max = 1/1/1 ms"""


def register_system_commands(registry: CommandRegistry):
    """Register all system/config commands."""

    # system-view - only from user view
    registry.register(
        r'^system-view$',
        lambda s: _system_view(s),
        [ViewType.USER]
    )

    # quit - available in all views
    registry.register(
        r'^quit$',
        lambda s: _quit(s)
    )

    # return - available in config views
    registry.register(
        r'^return$',
        lambda s: _return_cmd(s),
        [ViewType.SYSTEM, ViewType.INTERFACE, ViewType.AAA, ViewType.ACL, ViewType.VLAN]
    )

    # sysname - only in system view
    registry.register(
        r'^sysname\s+(?P<name>\S+)$',
        lambda s, name: _sysname(s, name),
        [ViewType.SYSTEM]
    )

    # screen-length - user view or system view
    registry.register(
        r'^screen-length\s+(?P<length>\d+)(?:\s+(?P<temporary>temporary))?$',
        lambda s, length, temporary=None: _screen_length(s, length, temporary),
        [ViewType.USER, ViewType.SYSTEM]
    )

    # interface - system view
    registry.register(
        r'^interface\s+(?P<name>\S+)$',
        lambda s, name: _interface(s, name),
        [ViewType.SYSTEM]
    )

    # undo - config views
    registry.register(
        r'^undo\s+(?P<command>.+)$',
        lambda s, command: _undo(s, command),
        [ViewType.SYSTEM, ViewType.INTERFACE, ViewType.AAA, ViewType.ACL, ViewType.VLAN]
    )

    # save - user view
    registry.register(
        r'^save(?:\s+(?P<filename>\S+))?$',
        lambda s, filename=None: _save(s, filename),
        [ViewType.USER]
    )

    # reboot - user view
    registry.register(
        r'^reboot$',
        lambda s: _reboot(s),
        [ViewType.USER]
    )

    # ping - user view
    registry.register(
        r'^ping\s+(?P<host>\S+)$',
        lambda s, host: _ping(s, host),
        [ViewType.USER]
    )
