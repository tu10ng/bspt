"""Telnet protocol constants and handling.

Mirrors constants from src-tauri/src/telnet.rs for protocol compatibility.
"""

from enum import IntEnum
from typing import Tuple, List, Optional
from dataclasses import dataclass


# Telnet protocol constants (RFC 854)
class TelnetCmd(IntEnum):
    """Telnet command bytes."""
    SE = 240    # Sub-negotiation End
    NOP = 241   # No Operation
    DM = 242    # Data Mark
    BRK = 243   # Break
    IP = 244    # Interrupt Process
    AO = 245    # Abort Output
    AYT = 246   # Are You There
    EC = 247    # Erase Character
    EL = 248    # Erase Line
    GA = 249    # Go Ahead
    SB = 250    # Sub-negotiation Begin
    WILL = 251
    WONT = 252
    DO = 253
    DONT = 254
    IAC = 255   # Interpret As Command


# Telnet options
class TelnetOpt(IntEnum):
    """Telnet option codes."""
    ECHO = 1
    SUPPRESS_GO_AHEAD = 3
    STATUS = 5
    TIMING_MARK = 6
    TERMINAL_TYPE = 24
    NAWS = 31           # Negotiate About Window Size
    TERMINAL_SPEED = 32
    LINEMODE = 34
    NEW_ENVIRON = 39


@dataclass
class TelnetCommand:
    """Parsed telnet command."""
    cmd: int
    option: Optional[int] = None
    data: Optional[bytes] = None


class TelnetParser:
    """Parse telnet protocol from byte stream."""

    def __init__(self):
        self._state = 'normal'
        self._subneg_option = 0
        self._subneg_data = bytearray()

    def parse(self, data: bytes) -> Tuple[bytes, List[TelnetCommand]]:
        """Parse input bytes, return (clean_data, commands)."""
        output = bytearray()
        commands = []

        for byte in data:
            if self._state == 'normal':
                if byte == TelnetCmd.IAC:
                    self._state = 'iac'
                else:
                    output.append(byte)
            elif self._state == 'iac':
                if byte == TelnetCmd.IAC:
                    output.append(TelnetCmd.IAC)
                    self._state = 'normal'
                elif byte == TelnetCmd.WILL:
                    self._state = 'will'
                elif byte == TelnetCmd.WONT:
                    self._state = 'wont'
                elif byte == TelnetCmd.DO:
                    self._state = 'do'
                elif byte == TelnetCmd.DONT:
                    self._state = 'dont'
                elif byte == TelnetCmd.SB:
                    self._state = 'sb'
                elif byte == TelnetCmd.SE:
                    self._state = 'normal'
                else:
                    self._state = 'normal'
            elif self._state == 'will':
                commands.append(TelnetCommand(TelnetCmd.WILL, byte))
                self._state = 'normal'
            elif self._state == 'wont':
                commands.append(TelnetCommand(TelnetCmd.WONT, byte))
                self._state = 'normal'
            elif self._state == 'do':
                commands.append(TelnetCommand(TelnetCmd.DO, byte))
                self._state = 'normal'
            elif self._state == 'dont':
                commands.append(TelnetCommand(TelnetCmd.DONT, byte))
                self._state = 'normal'
            elif self._state == 'sb':
                self._subneg_option = byte
                self._subneg_data.clear()
                self._state = 'sb_data'
            elif self._state == 'sb_data':
                if byte == TelnetCmd.IAC:
                    self._state = 'sb_iac'
                else:
                    self._subneg_data.append(byte)
            elif self._state == 'sb_iac':
                if byte == TelnetCmd.SE:
                    commands.append(TelnetCommand(
                        TelnetCmd.SB,
                        self._subneg_option,
                        bytes(self._subneg_data)
                    ))
                    self._state = 'normal'
                elif byte == TelnetCmd.IAC:
                    self._subneg_data.append(TelnetCmd.IAC)
                    self._state = 'sb_data'
                else:
                    self._state = 'normal'

        return bytes(output), commands


class TelnetNegotiator:
    """Handle telnet option negotiation from server side."""

    def __init__(self):
        self.local_options = set()  # Options we WILL do
        self.remote_options = set()  # Options we want client to DO

    def initial_negotiation(self) -> bytes:
        """Send initial negotiation to client."""
        response = bytearray()

        # Server will echo
        response.extend([TelnetCmd.IAC, TelnetCmd.WILL, TelnetOpt.ECHO])
        self.local_options.add(TelnetOpt.ECHO)

        # Server will suppress go-ahead
        response.extend([TelnetCmd.IAC, TelnetCmd.WILL, TelnetOpt.SUPPRESS_GO_AHEAD])
        self.local_options.add(TelnetOpt.SUPPRESS_GO_AHEAD)

        # Request client to send NAWS
        response.extend([TelnetCmd.IAC, TelnetCmd.DO, TelnetOpt.NAWS])

        return bytes(response)

    def handle_command(self, cmd: TelnetCommand) -> bytes:
        """Handle a telnet command, return response bytes."""
        response = bytearray()

        if cmd.cmd == TelnetCmd.WILL:
            # Client offers to do something
            if cmd.option in (TelnetOpt.NAWS, TelnetOpt.TERMINAL_TYPE):
                response.extend([TelnetCmd.IAC, TelnetCmd.DO, cmd.option])
                self.remote_options.add(cmd.option)
            else:
                response.extend([TelnetCmd.IAC, TelnetCmd.DONT, cmd.option])

        elif cmd.cmd == TelnetCmd.WONT:
            # Client refuses
            response.extend([TelnetCmd.IAC, TelnetCmd.DONT, cmd.option])
            self.remote_options.discard(cmd.option)

        elif cmd.cmd == TelnetCmd.DO:
            # Client requests us to do something
            if cmd.option in (TelnetOpt.ECHO, TelnetOpt.SUPPRESS_GO_AHEAD):
                if cmd.option not in self.local_options:
                    response.extend([TelnetCmd.IAC, TelnetCmd.WILL, cmd.option])
                    self.local_options.add(cmd.option)
            else:
                response.extend([TelnetCmd.IAC, TelnetCmd.WONT, cmd.option])

        elif cmd.cmd == TelnetCmd.DONT:
            # Client demands we stop something
            if cmd.option in self.local_options:
                response.extend([TelnetCmd.IAC, TelnetCmd.WONT, cmd.option])
                self.local_options.discard(cmd.option)

        elif cmd.cmd == TelnetCmd.SB:
            # Subnegotiation
            if cmd.option == TelnetOpt.NAWS and cmd.data and len(cmd.data) >= 4:
                # Window size: width(2) + height(2)
                width = (cmd.data[0] << 8) | cmd.data[1]
                height = (cmd.data[2] << 8) | cmd.data[3]
                # Store for pagination if needed
                self._window_size = (width, height)

        return bytes(response)

    @property
    def window_size(self) -> Tuple[int, int]:
        """Get negotiated window size (width, height)."""
        return getattr(self, '_window_size', (80, 24))
