"""Asyncio-based Telnet server for VRP mock."""

import asyncio
import logging
import signal
import sys
from enum import Enum, auto
from typing import Optional

from .telnet import TelnetParser, TelnetNegotiator, TelnetOpt
from .session import VRPSession
from .pagination import PaginationHandler
from .commands import create_registry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default credentials
DEFAULT_USERNAME = "root123"
DEFAULT_PASSWORD = "Root@123"


class LoginState(Enum):
    """Login state machine."""
    USERNAME = auto()  # Waiting for username
    PASSWORD = auto()  # Waiting for password
    AUTHENTICATED = auto()  # Login successful


class VRPClientHandler:
    """Handle a single VRP telnet client connection."""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        client_id: int,
        username: str = DEFAULT_USERNAME,
        password: str = DEFAULT_PASSWORD
    ):
        self.reader = reader
        self.writer = writer
        self.client_id = client_id
        self.session = VRPSession()
        self.parser = TelnetParser()
        self.negotiator = TelnetNegotiator()
        self.pagination = PaginationHandler()
        self.registry = create_registry()
        self._running = True
        self._input_buffer = bytearray()
        self._last_was_cr = False  # Track CR for CRLF handling
        # Login state
        self._login_state = LoginState.USERNAME
        self._username = username
        self._password = password
        self._input_username = ""
        self._login_attempts = 0
        self._max_attempts = 3

    async def handle(self):
        """Main client handler loop."""
        addr = self.writer.get_extra_info('peername')
        logger.info(f"[{self.client_id}] New connection from {addr}")

        try:
            # Send initial telnet negotiation
            await self._send_raw(self.negotiator.initial_negotiation())

            # Wait a bit for client negotiation
            await asyncio.sleep(0.1)

            # Send login prompt
            await self._send_login_banner()
            await self._send_login_prompt()

            # Main command loop
            while self._running:
                try:
                    data = await asyncio.wait_for(
                        self.reader.read(1024),
                        timeout=300.0  # 5 minute idle timeout
                    )
                except asyncio.TimeoutError:
                    logger.info(f"[{self.client_id}] Idle timeout")
                    break

                if not data:
                    logger.info(f"[{self.client_id}] Client disconnected")
                    break

                await self._process_input(data)

        except asyncio.CancelledError:
            logger.info(f"[{self.client_id}] Handler cancelled")
        except Exception as e:
            logger.error(f"[{self.client_id}] Error: {e}")
        finally:
            self.writer.close()
            try:
                await self.writer.wait_closed()
            except Exception:
                pass
            logger.info(f"[{self.client_id}] Connection closed")

    async def _process_input(self, data: bytes):
        """Process incoming data."""
        # Parse telnet protocol
        clean_data, commands = self.parser.parse(data)

        # Handle telnet commands
        for cmd in commands:
            response = self.negotiator.handle_command(cmd)
            if response:
                await self._send_raw(response)

        # Handle login state
        if self._login_state != LoginState.AUTHENTICATED:
            for byte in clean_data:
                await self._handle_login_char(byte)
            return

        # Handle pagination input
        if self.pagination.is_paginating:
            for byte in clean_data:
                output, needs_more = self.pagination.handle_input(bytes([byte]))
                if output:
                    await self._send(output)
                if not needs_more:
                    await self._send_prompt()
            return

        # Process character input
        for byte in clean_data:
            await self._handle_char(byte)

    async def _handle_char(self, byte: int):
        """Handle a single character input."""
        char = bytes([byte])

        # Handle CRLF: ignore LF after CR
        if byte == 0x0a and self._last_was_cr:
            self._last_was_cr = False
            return
        self._last_was_cr = (byte == 0x0d)

        if byte == 0x03:  # Ctrl+C
            self._input_buffer.clear()
            await self._send("^C\r\n")
            await self._send_prompt()

        elif byte == 0x1a:  # Ctrl+Z
            self._input_buffer.clear()
            self.session.return_to_user()
            await self._send("\r\n")
            await self._send_prompt()

        elif byte in (0x0d, 0x0a):  # Enter
            if self._input_buffer:
                command = self._input_buffer.decode('utf-8', errors='ignore').strip()
                self._input_buffer.clear()
                await self._send("\r\n")
                await self._execute_command(command)
            else:
                await self._send("\r\n")
                await self._send_prompt()

        elif byte == 0x7f or byte == 0x08:  # Backspace
            if self._input_buffer:
                self._input_buffer.pop()
                # Erase character: backspace, space, backspace
                await self._send("\b \b")

        elif byte == 0x09:  # Tab - command completion
            # Simple tab completion hint
            await self._send("\x07")  # Bell

        elif 0x20 <= byte < 0x7f:  # Printable ASCII
            self._input_buffer.append(byte)
            # Echo the character
            await self._send(char.decode('utf-8'))

    async def _execute_command(self, command: str):
        """Execute a VRP command."""
        if not command:
            await self._send_prompt()
            return

        # Try to execute command
        result = self.registry.execute(command, self.session)

        if result is None:
            # Unknown command
            await self._send(f"Error: Unrecognized command '{command}'\r\n")
            await self._send_prompt()
            return

        # Check for logout signal
        if result == "LOGOUT":
            await self._send("Logout\r\n")
            self._running = False
            return

        if result:
            # Check if pagination is needed
            output, needs_more = self.pagination.start_pagination(
                result,
                self.session.screen_length
            )
            # Convert newlines to CRLF
            output = output.replace('\n', '\r\n')
            await self._send(output)

            if needs_more:
                return  # Don't send prompt, wait for pagination input

            await self._send("\r\n")

        await self._send_prompt()

    async def _handle_login_char(self, byte: int):
        """Handle character input during login."""
        # Handle CRLF: ignore LF after CR
        if byte == 0x0a and self._last_was_cr:
            self._last_was_cr = False
            return
        self._last_was_cr = (byte == 0x0d)

        if byte == 0x03:  # Ctrl+C
            self._input_buffer.clear()
            await self._send("\r\n")
            await self._send_login_prompt()

        elif byte in (0x0d, 0x0a):  # Enter
            input_str = self._input_buffer.decode('utf-8', errors='ignore').strip()
            self._input_buffer.clear()
            await self._send("\r\n")

            if self._login_state == LoginState.USERNAME:
                self._input_username = input_str
                self._login_state = LoginState.PASSWORD
                await self._send("Password:")

            elif self._login_state == LoginState.PASSWORD:
                if self._input_username == self._username and input_str == self._password:
                    # Login successful
                    self._login_state = LoginState.AUTHENTICATED
                    logger.info(f"[{self.client_id}] Login successful: {self._input_username}")
                    await self._send_banner()
                    await self._send_prompt()
                else:
                    # Login failed
                    self._login_attempts += 1
                    logger.warning(f"[{self.client_id}] Login failed: {self._input_username} (attempt {self._login_attempts})")

                    if self._login_attempts >= self._max_attempts:
                        await self._send("Error: Too many failed attempts. Connection closed.\r\n")
                        self._running = False
                    else:
                        await self._send("Error: Username or password is invalid.\r\n")
                        self._login_state = LoginState.USERNAME
                        await self._send_login_prompt()

        elif byte == 0x7f or byte == 0x08:  # Backspace
            if self._input_buffer:
                self._input_buffer.pop()
                if self._login_state == LoginState.USERNAME:
                    await self._send("\b \b")
                # Don't echo backspace for password

        elif 0x20 <= byte < 0x7f:  # Printable ASCII
            self._input_buffer.append(byte)
            if self._login_state == LoginState.USERNAME:
                await self._send(chr(byte))
            # Don't echo password characters

    async def _send_login_banner(self):
        """Send login banner."""
        banner = """
Warning: This system is restricted to authorized users for authorized use only.
         Unauthorized access is forbidden.

"""
        await self._send(banner.replace('\n', '\r\n'))

    async def _send_login_prompt(self):
        """Send username prompt."""
        await self._send("Username:")

    async def _send_banner(self):
        """Send welcome banner after login."""
        banner = """
Info: The max number of VTY users is 10, the number of current VTY users online is 1.
      The current login time is 2024-01-15 10:30:00.
"""
        await self._send(banner.replace('\n', '\r\n'))

    async def _send_prompt(self):
        """Send current prompt."""
        await self._send(self.session.prompt)

    async def _send(self, text: str):
        """Send text to client."""
        self.writer.write(text.encode('utf-8'))
        await self.writer.drain()

    async def _send_raw(self, data: bytes):
        """Send raw bytes to client."""
        self.writer.write(data)
        await self.writer.drain()


class VRPMockServer:
    """Asyncio-based VRP mock telnet server."""

    def __init__(self, host: str = '0.0.0.0', port: int = 23):
        self.host = host
        self.port = port
        self._server: Optional[asyncio.Server] = None
        self._client_counter = 0
        self._clients: set = set()

    async def start(self):
        """Start the server."""
        self._server = await asyncio.start_server(
            self._handle_client,
            self.host,
            self.port
        )

        addrs = ', '.join(str(sock.getsockname()) for sock in self._server.sockets)
        logger.info(f"VRP Mock Server listening on {addrs}")

        async with self._server:
            await self._server.serve_forever()

    async def _handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter
    ):
        """Handle new client connection."""
        self._client_counter += 1
        client_id = self._client_counter

        handler = VRPClientHandler(reader, writer, client_id)
        task = asyncio.create_task(handler.handle())
        self._clients.add(task)

        try:
            await task
        finally:
            self._clients.discard(task)

    async def stop(self):
        """Stop the server gracefully."""
        logger.info("Shutting down server...")

        if self._server:
            self._server.close()
            await self._server.wait_closed()

        # Cancel all client handlers
        for task in self._clients:
            task.cancel()

        if self._clients:
            await asyncio.gather(*self._clients, return_exceptions=True)

        logger.info("Server stopped")


async def main():
    """Main entry point."""
    server = VRPMockServer(host='0.0.0.0', port=23)

    # Setup signal handlers for graceful shutdown
    loop = asyncio.get_running_loop()

    def signal_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(server.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await server.start()
    except asyncio.CancelledError:
        pass


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
