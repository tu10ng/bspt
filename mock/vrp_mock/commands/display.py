"""Display command handlers."""

import os
from pathlib import Path
from ..session import VRPSession, ViewType
from .registry import CommandRegistry


def _load_response(name: str) -> str:
    """Load response template from file."""
    # Try multiple paths
    paths = [
        Path(__file__).parent.parent.parent / 'responses' / f'{name}.txt',
        Path('/app/responses') / f'{name}.txt',
    ]

    for path in paths:
        if path.exists():
            return path.read_text()

    # Return inline default if file not found
    return f"% Response template '{name}' not found"


def _display_version(session: VRPSession) -> str:
    """Handle 'display version' command."""
    template = _load_response('display_version')
    return template.replace('{hostname}', session.hostname)


def _display_device(session: VRPSession) -> str:
    """Handle 'display device' command."""
    return _load_response('display_device')


def _display_interface(session: VRPSession, name: str = None, brief: str = None) -> str:
    """Handle 'display interface [name] [brief]' command."""
    if brief:
        return """Interface                   PHY      Protocol  InUti OutUti   inErrors  outErrors
GigabitEthernet0/0/1        up       up        0.01%  0.01%          0          0
GigabitEthernet0/0/2        up       up        0.02%  0.01%          0          0
GigabitEthernet0/0/3        down     down         0%     0%          0          0
GigabitEthernet0/0/4        down     down         0%     0%          0          0
MEth0/0/1                   up       up        0.01%  0.01%          0          0
NULL0                       up       up(s)        0%     0%          0          0
LoopBack0                   up       up(s)        0%     0%          0          0
Vlanif100                   up       up           0%     0%          0          0"""

    if name:
        normalized = session._normalize_interface_name(name) or name
        return f"""{normalized} current state : UP
Line protocol current state : UP
Description:
Route Port,The Maximum Transmit Unit is 1500
Internet Address is 10.0.0.1/24
IP Sending Frames' Format is PKTFMT_ETHNT_2, Hardware address is 00e0-fc12-3456
Last physical up time   : 2024-01-15 08:30:00
Last physical down time : 2024-01-14 22:15:00
Current system time: 2024-01-15 10:30:00
Speed : 1000,    Loopback: NONE
Duplex: FULL,    Negotiation: ENABLE
Mdi   : AUTO
Last 300 seconds input rate 1024 bits/sec, 2 packets/sec
Last 300 seconds output rate 2048 bits/sec, 3 packets/sec
Input peak rate 10240 bits/sec, Record time: 2024-01-15 09:00:00
Output peak rate 20480 bits/sec, Record time: 2024-01-15 09:15:00

Input:  1000 packets, 128000 bytes
  Unicast:                 900,  Multicast:                 50
  Broadcast:                50,  Jumbo:                      0
Output:  2000 packets, 256000 bytes
  Unicast:                1800,  Multicast:                100
  Broadcast:               100,  Jumbo:                      0"""

    # Display all interfaces summary
    return """GigabitEthernet0/0/1 current state : UP
GigabitEthernet0/0/2 current state : UP
GigabitEthernet0/0/3 current state : DOWN
GigabitEthernet0/0/4 current state : DOWN
MEth0/0/1 current state : UP
NULL0 current state : UP
LoopBack0 current state : UP
Vlanif100 current state : UP"""


def _display_current_configuration(session: VRPSession) -> str:
    """Handle 'display current-configuration' command."""
    return f"""!Software Version V800R021C00SPC100
!Last configuration was updated at 2024-01-15 08:00:00 UTC
!Last configuration was saved at 2024-01-14 22:00:00 UTC
#
sysname {session.hostname}
#
interface GigabitEthernet0/0/1
 ip address 10.0.0.1 255.255.255.0
#
interface GigabitEthernet0/0/2
 ip address 10.0.1.1 255.255.255.0
#
interface LoopBack0
 ip address 1.1.1.1 255.255.255.255
#
interface Vlanif100
 ip address 192.168.100.1 255.255.255.0
#
ip route-static 0.0.0.0 0.0.0.0 10.0.0.254
#
return"""


def _display_ip_interface(session: VRPSession, brief: str = None) -> str:
    """Handle 'display ip interface [brief]' command."""
    if brief:
        return """*down: administratively down
^down: standby
(l): loopback
(s): spoofing
(E): E-Trunk down
The number of interface that is UP in Physical is 5
The number of interface that is DOWN in Physical is 2
The number of interface that is UP in Protocol is 5
The number of interface that is DOWN in Protocol is 2

Interface                         IP Address/Mask      Physical   Protocol
GigabitEthernet0/0/1              10.0.0.1/24          up         up
GigabitEthernet0/0/2              10.0.1.1/24          up         up
GigabitEthernet0/0/3              unassigned           down       down
GigabitEthernet0/0/4              unassigned           down       down
LoopBack0                         1.1.1.1/32           up         up(s)
MEth0/0/1                         192.168.1.1/24       up         up
Vlanif100                         192.168.100.1/24     up         up"""

    return _display_ip_interface(session, brief='brief')


def _display_ip_routing_table(session: VRPSession) -> str:
    """Handle 'display ip routing-table' command."""
    return """Route Flags: R - relay, D - download to fib, T - to vpn-instance, B - black hole route
------------------------------------------------------------------------------
Routing Table : _public_
         Destinations : 8        Routes : 8

Destination/Mask    Proto   Pre  Cost        Flags NextHop         Interface

      0.0.0.0/0     Static  60   0            RD   10.0.0.254      GigabitEthernet0/0/1
      1.1.1.1/32    Direct  0    0             D   127.0.0.1       LoopBack0
     10.0.0.0/24    Direct  0    0             D   10.0.0.1        GigabitEthernet0/0/1
     10.0.0.1/32    Direct  0    0             D   127.0.0.1       GigabitEthernet0/0/1
     10.0.1.0/24    Direct  0    0             D   10.0.1.1        GigabitEthernet0/0/2
     10.0.1.1/32    Direct  0    0             D   127.0.0.1       GigabitEthernet0/0/2
  192.168.1.0/24    Direct  0    0             D   192.168.1.1     MEth0/0/1
192.168.100.0/24    Direct  0    0             D   192.168.100.1   Vlanif100"""


def _display_clock(session: VRPSession) -> str:
    """Handle 'display clock' command."""
    from datetime import datetime
    now = datetime.now()
    return f"""{now.strftime('%Y-%m-%d %H:%M:%S')}
Thursday
Time Zone : UTC"""


def register_display_commands(registry: CommandRegistry):
    """Register all display commands."""

    # display version
    registry.register(
        r'^display\s+version$',
        lambda s: _display_version(s)
    )

    # display device
    registry.register(
        r'^display\s+device$',
        lambda s: _display_device(s)
    )

    # display interface [name] [brief]
    registry.register(
        r'^display\s+interface(?:\s+(?P<name>\S+))?(?:\s+(?P<brief>brief))?$',
        lambda s, name=None, brief=None: _display_interface(s, name, brief)
    )

    # display current-configuration
    registry.register(
        r'^display\s+current-configuration$',
        lambda s: _display_current_configuration(s)
    )

    # display ip interface [brief]
    registry.register(
        r'^display\s+ip\s+interface(?:\s+(?P<brief>brief))?$',
        lambda s, brief=None: _display_ip_interface(s, brief)
    )

    # display ip routing-table
    registry.register(
        r'^display\s+ip\s+routing-table$',
        lambda s: _display_ip_routing_table(s)
    )

    # display clock
    registry.register(
        r'^display\s+clock$',
        lambda s: _display_clock(s)
    )
