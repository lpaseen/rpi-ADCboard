#!/bin/bash
#Purpose: load mcp3424 modules for adc and activate it
#
#2019-02-01  Peter Sjoberg <peters-src AT techwiz DOT ca>
#	Created
#

echo "Load mcp3424 module:"
lsmod|grep -q mcp3422 || sudo modprobe mcp3422

addresses=$(i2cdetect -y  1|awk '/^60:/{print $10,$11,$12,$13,$14,$15,$16,$17}'|xargs -n1|grep -vE "UU|--")
[ -z "$addresses" ] && addresses=6e

for address in $addresses;do
    [ -e /sys/bus/i2c/devices/i2c-1/device/i2c-1/1-00$address ] || echo mcp3424 0x$address|sudo tee -a /sys/bus/i2c/devices/i2c-1/new_device

    if [ ! -e /sys/bus/i2c/devices/i2c-1/device/i2c-1/1-00$address ];then
        echo "something didn't work, abort"
        i2cdetect -y  1
        exit
    fi

    sudo chown pi /sys/bus/i2c/devices/1-00${address}/iio\:device0/*
    #echo "setup scale on $address:"
    #echo 3 >/sys/bus/i2c/devices/1-00${address}/iio:device0/in_voltage_sampling_frequency  # 18 bit 
    #echo 0.000001953 >/sys/bus/i2c/devices/1-00${address}/iio\:device0/in_voltage0_scale   # more gain

    echo "values on $address"
    for port in {0..3};do
        v=$(echo $(cat /sys/bus/i2c/devices/1-00${address}/iio:device0/in_voltage${port}_raw)*$(cat /sys/bus/i2c/devices/1-00${address}/iio:device0/in_voltage${port}_scale)|bc -l)
        echo "$port: $v  $(echo $v*2|bc -l) $(echo $v*3|bc -l)"
    done
done
