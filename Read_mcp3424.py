#!/usr/bin/env python3
# Purpose: Proof of concept on how to read values from and configure the mcp3424
#          The code is targeted for a raspberry pi expansionboard that 
#          has 8 differential ports with a voltage divider allowing measuring of 0-14V
#
# Copyright: Peter Sjöberg
#
# License: GPL3
#
# Part of this should probably be a separate library but that will have to be done some other day
#
#2019-03-21  Peter Sjoberg <peters-src AT techwiz DOT ca>
#	created

# https://raspberry-projects.com/pi/programming-in-python/i2c-programming-in-python/using-the-i2c-interface-2
import smbus
import time
import json
import re
import math

from CalibrationConstants import TrimConstant

# https://docs.python.org/3/library/argparse.html
import argparse
# Instantiate the parser
parser = argparse.ArgumentParser(description='Read mcp3424 values using smbus = no need for kernel module')

# Optional argument
parser.add_argument('-a','--addresses', default="68,69,6a,6b,6c,6d,6e,6f", help='hex addresses of the chip on ech board, like "68,69,6a,6b" for two boards with default config')
parser.add_argument('-p','--port'     , default="1-8",  help='ports to show, like "3-4"')
parser.add_argument('-b','--bits'     , type=int, default="18", choices=[12,14,16,18],  help='bits')
parser.add_argument('-g','--gain'     , type=int, choices=[1,2,4,8],      help='gain')
parser.add_argument('-s','--samples'  , type=int, default="1",  help='samples to show')
parser.add_argument('-d','--delay'    , default="1.5",  help='delay between each sample in seconds, fractions allowed')
parser.add_argument('--R1'     , type=int, default="120000",  help='ohms of upper resistor in voltage divider')
parser.add_argument('--R2'     , type=int, default="20000",   help='ohms of lower resistor in voltage divider')
parser.add_argument('--calibrate', type=float, help=argparse.SUPPRESS)
parser.add_argument('--debug', type=int, help=argparse.SUPPRESS)
#parser.add_argument('--', type=int, help='')
args = parser.parse_args()
#address=int(args.address,16)
addressstr=args.addresses

#ch=args.channel-1
port=args.port
bits=args.bits
if (args.gain):
    PGA=args.gain
else:
    PGA=1
samples=args.samples
delay=float(args.delay)
R1=args.R1
R2=args.R2
if (args.calibrate):
    CalibrateV=args.calibrate
else:
    CalibrateV=0

if (args.debug):
    DEBUG=args.debug
else:
    DEBUG=0

addresses=[]
hexflag=bool(re.match('(?=.*[a-fA-F])',addressstr)) # allows you to skip '0x' if it is something like "6e,6f"
for a in addressstr.split(','):
    if (hexflag):
        addresses.append(int(a,16))
    else:
        addresses.append(int(a,0))

#for a in addresses:
#    print("a={0:3d}, 0x{0:2x} ".format(a,a))
################
# A simple class to generate a rolling average
# ra=avg(max_list_size)
# ra.add(new_value)
# ra.add(new_value)
# ra.add(new_value)
# print (ra.get_avg()) # print the average for the last (max(len(newvalues),max_list_size)) values
class avg():
    
    def __init__(self,maxlength):
        self.maxlen=maxlength
        self.head=0
        self.values=[]
    
    def add(self,new):
        if (len(self.values)<self.maxlen):
            self.values.append(new)
            self.head=len(self.values)-1
        else:
            if (self.head>=(self.maxlen-1)):
                self.head=0
            else:
                self.head+=1
            self.values[self.head]=new
        #print("Adding {0}, head={1}, sum={2}, {3}".format(new,self.head,sum(self.values),self))
        return len(self.values)

    def get_avg(self):
        return (sum(self.values)/len(self.values))


# from https://stackoverflow.com/questions/6405208/how-to-convert-numeric-string-ranges-to-a-list-in-python
def f(s):
    return sum(((list(range(*[int(j) + k for k,j in enumerate(i.split('-'))]))
                              if '-' in i else [int(i)]) for i in s.split(',')), [])
# convert strings like 1,3 or 1-8 to a list
ports=f(port)

#for a in addresses:
#    print("a={0:3d}, 0x{0:2x} ".format(a,a))
#print("port={0}  >{1}<".format(port,f(port)))
#for p in f(port):
#    print("p={0:3d}, 0x{0:02x} ".format(p,p))
#exit(0)
        
#addresses=[
#    0x6e,
#    0x6f,
#    0x68,
#    0x69,
#    0x6a,
#    0x6b,
#    0x6c,
#    0x6d ]


bus = smbus.SMBus(1) # would be bus 0 if old raspberry pi

# 12bit / 1mV       /  240 SPS / -2048   --   2047
# 14bit / 250 uV    /   60 SPS / -8192   --   8191
# 16bit / 62.5uV    /   15 SPS / -32768  --  32767
# 18bit / 15.625uV  / 3.75 SPS / -131072 -- 131071

MCP3424_RDY = 0x80
MCP3424_Channel = {
    1 : 0x00,
    2 : 0x20,
    3 : 0x40,
    4 : 0x60,
    "mask" : 0x60 }
MCP3424_OC = 0x10
MCP3424_bits = {
    12 : 0x00,
    14 : 0x04,
    16 : 0x08,
    18 : 0x0c,
    "mask" : 0x0c}
MCP3424_GAIN = {
    1 : 0x00,   # 2.048V
    2 : 0x01,   # 1.024V
    4 : 0x02,   # 0.512V
    8 : 0x03,   # 0.256V
    "mask" : 0x03}

data=dict()
maxport=32

################
# Setup, load values into data record
# Should possible be done from config file
def Setup():
    global data
    global maxport
    
    board=1
    chip=1
    channel=1
    #always setup all ports
    for port in range(1,maxport+1):
        #print ("port={port},board={board},chip={chip}".format(port=port,board=board,chip=chip))
        data[port]=dict()
        try:
            data[port]['bits']=bits
            data[port]['gain']=PGA
            data[port]['board']=board
            data[port]['chip']=chip
            data[port]['chipaddr']=addresses[board*2+chip-3]
            data[port]['channel']=channel
            data[port]['R1']=R1 # upper resistor in voltage divider
            data[port]['R2']=R2 # lower resistor in voltage divider
            if (data[port]["bits"] == 18):
                data[port]['raw']=bus.read_i2c_block_data(data[port]['chipaddr'],MCP3424_RDY | MCP3424_OC | MCP3424_Channel[data[port]['channel']] | MCP3424_bits[data[port]["bits"]] | MCP3424_GAIN[data[port]["gain"]],4)
            else:
                data[port]['raw']=bus.read_i2c_block_data(data[port]['chipaddr'],MCP3424_RDY | MCP3424_OC | MCP3424_Channel[data[port]['channel']] | MCP3424_bits[data[port]["bits"]] | MCP3424_GAIN[data[port]["gain"]],3)
        except (IndexError,OSError):
            maxport=port-1
            break
        data[port]['mV']=-999999
        data[port]['volt']=-999999
        data[port]['LSB']=(2*2.048)/(2**bits)
        adc2volt(port) # to fill in rawVal and so on

        channel+=1
        if (channel == 5):
            channel=1
            chip+=1
        if (chip==3):
            chip=1
            board+=1
            

################
# Read ADC value for one channel
# If channel channel is changed it will automatically initiane a new conversion
#  you need to check status bit if it's done
# Parameter: port = port to read
# Return: status byte
def readADC(port):
    global data
    address=data[port]['chipaddr']
    if (data[port]["bits"] == 18):
        data[port]['raw']=bus.read_i2c_block_data(address,MCP3424_RDY | MCP3424_OC | MCP3424_Channel[data[port]['channel']] | MCP3424_bits[data[port]["bits"]] | MCP3424_GAIN[data[port]["gain"]],4)
        data[port]['status']=data[port]['raw'][3]
    else:
        data[port]['raw']=bus.read_i2c_block_data(address,MCP3424_RDY | MCP3424_OC | MCP3424_Channel[data[port]['channel']] | MCP3424_bits[data[port]["bits"]] | MCP3424_GAIN[data[port]["gain"]],3)
        data[port]['status']=data[port]['raw'][2]
#    print("data >{0:x}<".format(data[port]['raw']))
    return data[port]['status']

################
# Print out a decoded version of the status byte
def printCfg(cfg):
    msg=hex(cfg)
    if (cfg & MCP3424_RDY):
        #print (" data NOT ready")
        msg+=": data NOT ready"
    else:
        #print (" Data ready")
        msg+= ": Data ready"
    msg+=", "

    if (cfg & MCP3424_Channel["mask"] == MCP3424_Channel[1]):
        #print (" Channel 1")
        msg+="Channel 1"
    elif (cfg & MCP3424_Channel["mask"] == MCP3424_Channel[2]):
        #print (" Channel 2")
        msg+="Channel 2"
    elif (cfg & MCP3424_Channel["mask"] == MCP3424_Channel[3]):
        #print (" Channel 3")
        msg+="Channel 3"
    elif (cfg & MCP3424_Channel["mask"] == MCP3424_Channel[4]):
        #print (" Channel 4")
        msg+="Channel 4"
    else:
        #print ("           Channel BUG - should not be here")
        msg+="           Channel BUG - should not be here"
    msg+=", "

    if (cfg & MCP3424_OC):
        #print (" Continous mode")
        msg+="Continous mode"
    else:
        #print (" One shot")
        msg+="One shot"
    msg+=", "
    
    if (cfg & MCP3424_bits["mask"] == MCP3424_bits[12]):
        #print (" 12 bits/ 240 SPS")
        msg+="12 bits/ 240 SPS"
    elif (cfg & MCP3424_bits["mask"] == MCP3424_bits[14]):
        #print (" 14 bits/  60 SPS")
        msg+="14 bits/ 60 SPS"
    elif (cfg & MCP3424_bits["mask"] == MCP3424_bits[16]):
        #print (" 16 bits/  15 SPS")
        msg+="16 bits/ 15 SPS"
    elif (cfg & MCP3424_bits["mask"] == MCP3424_bits[18]):
        #print (" 18 bits/   3 SPS")
        msg+="18 bits/ 3 SPS"
    else:
        #print ("           bits BUG - should not be here")
        msg+="           bits BUG - should not be here"
    msg+=", "

    if (cfg & MCP3424_GAIN["mask"] == MCP3424_GAIN[1]):
        #print (" PGA = 1")
        msg+="PGA = 1"
    elif (cfg & MCP3424_GAIN["mask"] == MCP3424_GAIN[2]):
        #print (" PGA = 2")
        msg+="PGA = 2"
    elif (cfg & MCP3424_GAIN["mask"] == MCP3424_GAIN[4]):
        #print (" PGA = 4")
        msg+="PGA = 4"
    elif (cfg & MCP3424_GAIN["mask"] == MCP3424_GAIN[8]):
        #print (" PGA = 8")
        msg+="PGA = 8"
    else:
        #print ("           GAIN BUG - should not be here")
        msg+="          GAIN BUG - should not be here"
    return msg
            
################
# Convert raw data to Volt
def adc2volt(port):
    global data
    
    bits=data[port]['bits']
    val=data[port]['raw']
    
    LSB=(2*2.048)/(2**bits)
    if (bits == 18):
        rawVal = (val[0] & 0x3) <<16 | val[1] << 8 | val[2]
    elif (bits == 16):
        rawVal = val[0] <<8 | val[1]
    elif (bits == 14):
        rawVal = (val[0] & 0x3f)<<8 | val[1]
    elif (bits == 12):
        rawVal = (val[0] & 0xf)<<8 | val[1]

    if (val[0] & 0x80):
        rawVal -= 2**bits

    data[port]['rawVal']=rawVal
    data[port]['adcV']=(data[port]['rawVal']*LSB)/data[port]['gain']
    data[port]['mV']=data[port]['adcV']/1000
    
    #data[port]['Rl']=2500000/data[port]['gain'] # ADC load by the specsheet but doesn't work so good
    # The following formula/constants was created by taking a lot of samples with known voltage and then
    # calculate a trendline to get a proper value of the ADC load
    
    try:
        Const1=TrimConstant[bits][gain]['Const1']
        Const2=TrimConstant[bits][gain]['Const2']
        Const3=TrimConstant[bits][gain]['Const3']
    except KeyError:
        print("ERROR, unknown bits of {} or gain of{} - ABORT".format(bits,gain))
        exit(112)
        
    data[port]['Rl']=Const1*abs(data[port]['adcV'])**2+Const2*abs(data[port]['adcV'])+Const3
    
    if (DEBUG & 0x04):
        print("  end, rl={0}".format(data[port]['Rl']))
        
    if (data[port]['R1'] >0):
        data[port]['I']=data[port]['adcV']/data[port]['R2']
        data[port]['volt']=data[port]['I']*(data[port]['R1']+data[port]['R2'])
        data[port]['trueR2']=1/(1/data[port]['R2']+1/data[port]['Rl'])
        data[port]['trueI']=(data[port]['adcV'])/data[port]['trueR2']
        data[port]['trueV']=data[port]['trueI']*(data[port]['R1']+data[port]['trueR2'])
    else:
        data[port]['I']=data[port]['adcV']/data[port]['Rl']
        data[port]['volt']=data[port]['adcV']
        data[port]['trueV']=data[port]['adcV']
        
    data[port]['calI']=0        
    #
    # Calibration formula:
    #   V=10;adcV=1.36259375;RTop=120000;R1=20000;RTot=$(echo "$adcV/(($V-$adcV)/$RTop)"|bc -l);echo "RTot=$RTot";adcR=$(echo "($RTot*$R1)/($R1-$RTot)"|bc -l);echo "adcR-$adcR"
    #   V = Known voltage
    #   adcV = Voltage the ADC reads
    #   RTop = Upper resistor
    #   RTot = Total Bottom resistor
    #   R1 = value of the known bottom resistor
    #   adcR = the answer, value of the resistance the adc (and cap) have for "V"/adcV
    #   
    
    if (CalibrateV): # If the input voltage is known calculate Rl (adc impedance)
        if ((CalibrateV-data[port]['adcV']) != 0):
            RTot=data[port]['adcV']/((CalibrateV-data[port]['adcV'])/data[port]['R1'])
            data[port]['calI']=(CalibrateV-data[port]['adcV'])/data[port]['R1']
            data[port]['Rl']=(RTot*data[port]['R2'])/(data[port]['R2']-RTot)
            #print("\nDEBUG: {0}".format(data[port]))
        else:
            data[port]['Rl']=0

    return


################
# Show data values
def showData():
    board=1
    for port in ports:  # range(1,maxport+1):
        if (data[port]['board'] != board):
            board=data[port]['board']
            print()
        print("port ={port:2} Board ={board}, Chip # = {chip}, Chip adr ={addr:02x}, Channel ={ch}, bits={bits}, rawVal={rawVal}, mV={mV:1.6f}, LSB={lsb:1.7f} mV, pga={pga}, volt={volt:3.4f}, trueV={trueV:3.4f}, status=0x{status}"
              .format(
                  port=port,
                  board=data[port]['board'],
                  chip=data[port]['chip'],
                  addr=data[port]['chipaddr'],
                  ch=data[port]['channel'],
                  bits=data[port]['bits'],
                  rawVal=data[port]['rawVal'],
                  mV=data[port]['mV'],
                  lsb=data[port]['LSB']*1000,
                  pga=data[port]['gain'],
                  volt=data[port]['volt'],
                  trueV=data[port]['trueV'],
                  status=printCfg(data[port]['status'])))
    print()
    #print(json.dumps(data[1], sort_keys=True, indent=4))

################
# tune the port gain based on voltage
def AutoTune(port):
    margin=(2**data[port]['bits'])*0.01  # within 1% of the min/max value
    upper=(2**(data[port]['bits']-1)-margin)
    lower=-upper
    rawval=data[port]['rawVal']
    gain=data[port]['gain']

    if (data[port]['gain'] > 1 and (data[port]['rawVal'] > upper or data[port]['rawVal'] < lower)): # close to the edge
        if (data[port]['gain'] == 8):
            data[port]['gain']=4
        elif (data[port]['gain'] == 4):
            data[port]['gain']=2
        else:
            data[port]['gain']=1
        if (DEBUG & 0x01):
            if (gain != data[port]['gain']):
                print ("AutoTune: margin={margin}, upper={upper}, lower={lower}, rawval={rawval}, OLDgain={OLDgain}, gain={gain}".format(
                    margin=margin,upper=upper,lower=lower,rawval=rawval,OLDgain=gain,gain=data[port]['gain']))
    elif (data[port]['gain'] < 8 and (data[port]['rawVal'] < upper/2 and data[port]['rawVal'] > lower/2)): # can improve
        # port:  5, ch:1 raw value=  18771, adcV= 0.29329688, volt=  2.0530781, trueV=  2.0878938 (RollAvgTrueV=  2.0878938, mV=  2053.078125, tries=354, bits=18, gain=1, Rl=  1010914, trueI= 0.01495497 mA)
        #AutoTune: margin=13107.2, upper/2=58982.4, lower/2=-58982.4, rawval=18771, OLDgain=1, gain=2
        # port:  5, ch:1 raw value=  38008, adcV= 0.29693750, volt=  2.0785625, trueV=  2.1275834 (RollAvgTrueV=  2.1077386, mV=  2078.562500, tries=354, bits=18, gain=2, Rl=   726884, trueI= 0.01525538 mA)
        #AutoTune: margin=13107.2, upper/2=58982.4, lower/2=-58982.4, rawval=38008, OLDgain=2, gain=4
        if (data[port]['gain'] == 1):
            data[port]['gain']=2
        elif (data[port]['gain'] == 2):
            data[port]['gain']=4
        else:
            data[port]['gain']=8
        if (DEBUG & 0x01):
            if (gain != data[port]['gain']): # it changed
                showData()
                print ("AutoTune: margin={margin}, upper/2={upper}, lower/2={lower}, rawval={rawval}, OLDgain={OLDgain}, gain={gain}".format(
                    margin=margin,upper=upper/2,lower=lower/2,rawval=rawval,OLDgain=gain,gain=data[port]['gain']))

################################################################
################
#

# Initialize the data array with values for all ports
Setup()
               
#port=2
#cnt=1
#printCfg(data[port]['raw'][3])
#print(json.dumps(data[port], sort_keys=True, indent=4))
#print(json.dumps(data, sort_keys=True, indent=4))
#print ("Maxport = {0}".format(maxport))

raTrueV=dict()
for port in ports:
    raTrueV[port]=avg(10) # keep a rolling average of the last 10 values

cnt=[0]*(maxport+1)
for sample in range(samples):
    # first read all values and save them in data[]
    # for p in range(1,maxport+1):
    for port in ports:
        #print ("Checking port "+str(port))
        if (port >maxport):
            continue
        cnt[port]=1
        while (readADC(port) & MCP3424_RDY):
            cnt[port]+=1
        adc2volt(port)
        raTrueV[port].add(data[port]['trueV'])

    for port in ports:
        if (port >maxport):
            continue
        #showData()
        if (CalibrateV):
            print (" port: {port:2}, ch:{ch:1} raw value={rawVal:7}, adcV={adcV:< 10.8f}, volt={volt: 11.7f}, trueV={trueV: 11.7f} "\
                   "(RollAvgTrueV={raTrueV: 11.7f}, mV={mV: 13.6f}, tries={cnt:3d}, bits={bits}, gain={gain}, Rl={Rl: 9.0f}, trueI={trueI:< 10.8f} mA, calI={calI:12.8f} mA)".format(
                   port=port,ch=data[port]['channel'],rawVal=data[port]['rawVal'],adcV=data[port]['adcV'],volt=data[port]['volt'],trueV=data[port]['trueV'],
                   raTrueV=raTrueV[port].get_avg(), mV=data[port]['volt']*1000,bits=data[port]['bits'],gain=data[port]['gain'],cnt=cnt[port],Rl=data[port]['Rl'],
                   calI=data[port]['calI']*1000, trueI=data[port]['trueI']*1000))
        else:
            print (" port: {port:2}, ch:{ch:1} raw value={rawVal:7}, adcV={adcV:< 10.8f}, volt={volt: 11.7f}, trueV={trueV: 11.7f} "\
                   "(RollAvgTrueV={raTrueV: 11.7f}, mV={mV: 13.6f}, tries={cnt:3d}, bits={bits}, gain={gain}, Rl={Rl: 9.0f}, trueI={trueI:< 10.8f} mA)".format(
                   port=port,ch=data[port]['channel'],rawVal=data[port]['rawVal'],adcV=data[port]['adcV'],volt=data[port]['volt'],trueV=data[port]['trueV'],
                   raTrueV=raTrueV[port].get_avg(), mV=data[port]['volt']*1000,bits=data[port]['bits'],gain=data[port]['gain'],cnt=cnt[port],Rl=data[port]['Rl'],
                   trueI=data[port]['trueI']*1000))
        if (not args.gain):
            AutoTune(port)
    if (len(ports) > 1 ):
        print ("")
    try:
        time.sleep(delay)
    except KeyboardInterrupt:
        print ("Keyboard interrupt, abort")
        exit(0)

exit(0)

