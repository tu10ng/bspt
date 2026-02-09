"""VRP command handlers package."""

from .registry import CommandRegistry
from .display import register_display_commands
from .system import register_system_commands


def create_registry() -> CommandRegistry:
    """Create and configure command registry with all handlers."""
    registry = CommandRegistry()
    register_display_commands(registry)
    register_system_commands(registry)
    return registry


__all__ = ['CommandRegistry', 'create_registry']
