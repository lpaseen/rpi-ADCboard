#!/bin/bash
#Purpose: undo what Setup did - release MCP3424
#
#2019-02-06  Peter Sjoberg <peters-src AT techwiz DOT ca>
#	Created
#

echo 0x6e|sudo tee -a /sys/bus/i2c/devices/i2c-1/delete_device &>/dev/null
sudo modprobe -r mcp3422 &>/dev/null
