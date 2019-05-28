# rpi-ADCboard
Some simple code to read values from a raspberry pi board with two mcp3424 ADCs on them.


To run it you can get away with just
 `./Read_mcp3424.py`

You can be also be a little more specific like
```
  $ ./Read_mcp3424.py --port=1 --samples=3 --gain=2 --delay=1
  port:  1, ch:1 raw value=  85653, adcV= 0.66916406, volt=  4.6841484, trueV=  4.7371972 (RollAvgTrueV=  4.7371972, mV=  4684.148438, tries=355, bits=18, gain=2, Rl=  1513696, trueI= 0.03390028 mA)
  port:  1, ch:1 raw value=  85738, adcV= 0.66982812, volt=  4.6887969, trueV=  4.7418983 (RollAvgTrueV=  4.7395477, mV=  4688.796875, tries=  1, bits=18, gain=2, Rl=  1513696, trueI= 0.03393392 mA)
  port:  1, ch:1 raw value=  85754, adcV= 0.66995313, volt=  4.6896719, trueV=  4.7427832 (RollAvgTrueV=  4.7406262, mV=  4689.671875, tries=  1, bits=18, gain=2, Rl=  1513696, trueI= 0.03394025 mA)
```

For more info pass "--help"
```
$ ./Read_mcp3424.py --help
usage: Read_mcp3424.py [-h] [-a ADDRESSES] [-p PORT] [-b {12,14,16,18}]
                       [-g {1,2,4,8}] [-s SAMPLES] [-d DELAY] [--R1 R1]
                       [--R2 R2]

Read mcp3424 values using smbus = no need for kernel module

optional arguments:
  -h, --help            show this help message and exit
  -a ADDRESSES, --addresses ADDRESSES
                        hex addresses of the chip on ech board, like
                        "68,69,6a,6b" for two boards with default config
  -p PORT, --port PORT  ports to show, like "3-4"
  -b {12,14,16,18}, --bits {12,14,16,18}
                        bits
  -g {1,2,4,8}, --gain {1,2,4,8}
                        gain
  -s SAMPLES, --samples SAMPLES
                        samples to show
  -d DELAY, --delay DELAY
                        delay between each sample in seconds, fractions
                        allowed
  --R1 R1               ohms of upper resistor in voltage divider
  --R2 R2               ohms of lower resistor in voltage divider
```
