# Huawei VRP Mock Server

A Python-based Telnet mock server that simulates Huawei VRP router behavior for BSPT development and testing.

## Quick Start

### Using Docker (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Manual Run

```bash
# Run with default port 2323
./run.sh

# Or custom port
PORT=8023 ./run.sh
```

## Connecting

```bash
# Connect via telnet
telnet localhost 2323
```

**Default credentials:**
- Username: `root123`
- Password: `Root@123`

**From BSPT:**
- Host: `localhost`
- Port: `2323`
- Protocol: `Telnet`

## Supported Commands

### User View (`<Huawei>`)

| Command | Description |
|---------|-------------|
| `display version` | Show system version |
| `display device` | Show board/slot information |
| `display interface [name] [brief]` | Show interface status |
| `display ip interface [brief]` | Show IP interface info |
| `display ip routing-table` | Show routing table |
| `display current-configuration` | Show running config |
| `display clock` | Show system time |
| `system-view` | Enter system configuration mode |
| `ping <host>` | Ping a host |
| `screen-length <n> [temporary]` | Set screen pagination |
| `save [filename]` | Save configuration |
| `quit` | Logout |

### System View (`[Huawei]`)

| Command | Description |
|---------|-------------|
| `sysname <name>` | Set hostname |
| `interface <name>` | Enter interface configuration |
| `screen-length <n> [temporary]` | Set screen pagination |
| `quit` | Return to user view |
| `return` | Return to user view |

### Interface View (`[Huawei-GigabitEthernet0/0/1]`)

| Command | Description |
|---------|-------------|
| `quit` | Return to system view |
| `return` | Return to user view |

## Features

### Login Authentication

Server requires username/password authentication:

```
Username:root123
Password:
<Huawei>
```

- Max 3 login attempts before disconnect
- Password input is hidden (no echo)

### Command Abbreviation

Most commands support abbreviation:

- `dis ver` = `display version`
- `dis dev` = `display device`
- `dis int br` = `display interface brief`
- `sys` = `system-view`
- `q` = `quit`

### Pagination

Long output is paginated with `---- More ----`:

- **Space**: Next page
- **Enter**: Next line
- **q**: Abort output

Disable pagination:
```
<Huawei> screen-length 0 temporary
```

### Keyboard Shortcuts

- **Ctrl+C**: Abort current command
- **Ctrl+Z**: Return to user view
- **Backspace**: Delete character

## Response Templates

Custom response templates are in `responses/`:

- `display_version.txt` - System version info
- `display_device.txt` - Board/device info

Templates support `{hostname}` placeholder substitution.

## Architecture

```
vrp_mock/
├── server.py       # Asyncio Telnet server
├── session.py      # VRP state machine (views, hostname)
├── telnet.py       # Telnet protocol (IAC negotiation)
├── pagination.py   # "---- More ----" handling
└── commands/
    ├── registry.py  # Command dispatcher
    ├── display.py   # display commands
    └── system.py    # system/config commands
```

## Development

### Adding New Commands

1. Create handler in `commands/display.py` or `commands/system.py`:

```python
def _display_foo(session: VRPSession) -> str:
    return "Foo output here"
```

2. Register in the appropriate `register_*_commands` function:

```python
registry.register(
    r'^display\s+foo$',
    lambda s: _display_foo(s),
    [ViewType.USER]  # Optional: restrict to specific views
)
```

### Adding Response Templates

1. Create `responses/your_template.txt`
2. Load with `_load_response('your_template')`
3. Use `{placeholder}` for dynamic content

## Testing

```bash
# Test with expect script
expect -c '
spawn telnet localhost 2323
expect "Username:"
send "root123\r"
expect "Password:"
send "Root@123\r"
expect "<Huawei>"
send "display version\r"
expect "<Huawei>"
send "quit\r"
expect eof
'
```

## Troubleshooting

### Port Permission

Default port is 2323 (no root required). Use `run.sh` or Docker.

### Telnet Not Installed

```bash
# Ubuntu/Debian
sudo apt install telnet

# macOS
brew install telnet

# Windows
# Use PuTTY in Telnet mode
```

### Connection Refused

Check if server is running:

```bash
docker-compose ps
# or
netstat -tlnp | grep 2323
```
