/****************************************************************
* Purpose: Proof of concept on how to read values from and configure the mcp3424
*          The code is targeted for a raspberry pi expansionboard that 
*          has 8 ports with a voltage divider allowing measuring of 0-14V
*
* Copyright: Peter Sjöberg
*
* License: GPL3
*
* Note: i2c-bus is required, can be installed with
*           npm install i2c-bus
*
* 2019-07-16  Peter Sjoberg <peters-src AT techwiz DOT ca>
*	Created as a partial port of Read_mcp3425.py
*
*/


'use strict';

/* ports are numbered from 1-32. The each board has two chips and each chip has four channels.
 * board 1 has
 *  port1  = chip address[1] channel 1
 *  port2  = chip address[1] channel 2
 *  port3  = chip address[1] channel 3
 *  port4  = chip address[1] channel 4
 *  port5  = chip address[2] channel 1
 *  port6  = chip address[2] channel 2
 *  port7  = chip address[2] channel 3
 *  port8  = chip address[2] channel 4
 * board 2 continues in same pattern
 *  port9  = chip address[3] channel 1
 *  port10 = chip address[3] channel 2
 * and so on
 */

// default values
const BITS=18
const GAIN=1

const MCP3424_RDY = 0x80

const MCP3424_Channel = {
    1 : 0x00,
    2 : 0x20,
    3 : 0x40,
    4 : 0x60,
    "mask" : 0x60 }

const MCP3424_OC = 0x10

// 12bit / 1mV       /  240 SPS / -2048   --   2047
// 14bit / 250 uV    /   60 SPS / -8192   --   8191
// 16bit / 62.5uV    /   15 SPS / -32768  --  32767
// 18bit / 15.625uV  / 3.75 SPS / -131072 -- 131071
const MCP3424_bits = {
    12 : 0x00,
    14 : 0x04,
    16 : 0x08,
    18 : 0x0c,
    "mask" : 0x0c}

const MCP3424_GAIN = {
    1 : 0x00,   // 2.048V
    2 : 0x01,   // 1.024V
    4 : 0x02,   // 0.512V
    8 : 0x03,   // 0.256V
    "mask" : 0x03}

// Addresses of the ADC we want to access
const addresses=[
    0x68,0x69,
    0x6a,0x6b,
    0x6c,0x6d,
    0x6e,0x6f
]

const R1=120000;
const R2=20000;
const maxport=32;

const i2c = require('i2c-bus');
const i2c1 = i2c.openSync(1); // 1 for i2c bus 1

// The following formula/constants was created by calculate the proper Rl value over several voltage
// samples and then reverse engineer the formula and constants needed to create the correct ADC load.
/***********************/
var TrimConstant
TrimConstant=[]
TrimConstant[12]=[]
TrimConstant[12][1]=[]
TrimConstant[12][1]['Const1']=-7.29644998741772e+18
TrimConstant[12][1]['Const2']=1.8252066801568475e+19
TrimConstant[12][1]['Const3']=-9.561470143248126e+18
TrimConstant[12][2]=[]
TrimConstant[12][2]['Const1']=-1.4898381548524163e+19
TrimConstant[12][2]['Const2']=1.8452580931431174e+19
TrimConstant[12][2]['Const3']=-4.805276209813626e+18
TrimConstant[12][4]=[]
TrimConstant[12][4]['Const1']=-10118072.271809563
TrimConstant[12][4]['Const2']=6797352.007977883
TrimConstant[12][4]['Const3']=-263832.86114829977
TrimConstant[12][8]=[]
TrimConstant[12][8]['Const1']=-22986374.244420122
TrimConstant[12][8]['Const2']=7536052.779157299
TrimConstant[12][8]['Const3']=-258788.32091889498
TrimConstant[14]=[]
TrimConstant[14][1]=[]
TrimConstant[14][1]['Const1']=-547128.0816393106
TrimConstant[14][1]['Const2']=1959171.5248400136
TrimConstant[14][1]['Const3']=413393.9108785477
TrimConstant[14][2]=[]
TrimConstant[14][2]['Const1']=-1303354.7551292207
TrimConstant[14][2]['Const2']=2216492.26594754
TrimConstant[14][2]['Const3']=252631.72247966885
TrimConstant[14][4]=[]
TrimConstant[14][4]['Const1']=-603659.535929856
TrimConstant[14][4]['Const2']=1058285.263214671
TrimConstant[14][4]['Const3']=238635.61023626427
TrimConstant[14][8]=[]
TrimConstant[14][8]['Const1']=-321542.9453517512
TrimConstant[14][8]['Const2']=506255.5322955709
TrimConstant[14][8]['Const3']=174575.86010087654
TrimConstant[16]=[]
TrimConstant[16][1]=[]
TrimConstant[16][1]['Const1']=-538886.6327368342
TrimConstant[16][1]['Const2']=1929058.1036710313
TrimConstant[16][1]['Const3']=418277.36598391004
TrimConstant[16][2]=[]
TrimConstant[16][2]['Const1']=-1093021.2089518933
TrimConstant[16][2]['Const2']=2078583.7929054706
TrimConstant[16][2]['Const3']=252687.99370679908
TrimConstant[16][4]=[]
TrimConstant[16][4]['Const1']=-1025665.3681316198
TrimConstant[16][4]['Const2']=1238120.803775412
TrimConstant[16][4]['Const3']=229019.1443321319
TrimConstant[16][8]=[]
TrimConstant[16][8]['Const1']=-354280.916034503
TrimConstant[16][8]['Const2']=517745.8280310895
TrimConstant[16][8]['Const3']=175604.3187191613
TrimConstant[18]=[]
TrimConstant[18][1]=[]
TrimConstant[18][1]['Const1']=-549702.5567547062
TrimConstant[18][1]['Const2']=1957717.4623683672
TrimConstant[18][1]['Const3']=387836.79665354657
TrimConstant[18][2]=[]
TrimConstant[18][2]['Const1']=-1361374.6457417163
TrimConstant[18][2]['Const2']=2135565.100213241
TrimConstant[18][2]['Const3']=255336.17805034263
TrimConstant[18][4]=[]
TrimConstant[18][4]['Const1']=-1245462.6278009678
TrimConstant[18][4]['Const2']=1159128.6214418625
TrimConstant[18][4]['Const3']=241634.35669704582
TrimConstant[18][8]=[]
TrimConstant[18][8]['Const1']=231079.04899498075
TrimConstant[18][8]['Const2']=389831.38249999925
TrimConstant[18][8]['Const3']=182839.62771505647


//variable array that holds all values
var data=[];

// check on https://www.codota.com/code/javascript/modules/i2c-bus
function readADC(port){
    var size
    var i2cdata=Buffer(4); // place to store values read from the ADC

    if (data[port]['bits'] == 18){
        size=4;
    }else{
        size=3;
    }
    try {
        data[port]['valid']=true;
        i2c1.readI2cBlockSync(data[port]['chipaddr'], MCP3424_RDY | MCP3424_OC | MCP3424_Channel[data[port]['channel']] |MCP3424_bits[data[port]['bits']] | MCP3424_GAIN[data[port]["gain"]], size,i2cdata);
    }

    catch(e){ // 
        //console.log("read port no "+port" failed, marking it invalid");
        //console.log(e);
        data[port]['valid']=false;
    }
    data[port]['raw']=i2cdata;
} // readADC

/****************
* convert the raw ADC value to a voltage
*/

function adc2volt(port){
        
    let bits=data[port]['bits'];
    let val=data[port]['raw'];
    let gain=data[port]['gain'];
    
    let LSB=(2*2.048)/(2**bits);
    let rawVal,Const1,Const2,Const3

    if (bits == 18){
        rawVal = (val[0] & 0x3) <<16 | val[1] << 8 | val[2];
    }else if (bits == 16){
        rawVal = val[0] <<8 | val[1];
    }else if (bits == 14){
        rawVal = (val[0] & 0x3f)<<8 | val[1];
    }else if (bits == 12){
        rawVal = (val[0] & 0xf)<<8 | val[1];
    }
    
    if (val[0] & 0x80){
        rawVal -= 2**bits;
    }
    data[port]['rawVal']=rawVal;
    data[port]['adcV']=(data[port]['rawVal']*LSB)/data[port]['gain'];
    data[port]['mV']=data[port]['adcV']/1000;

    // ADC load by the specsheet but doesn't work so good
    // The following formula/constants was created by calculate the proper Rl value over several voltage
    // samples and then reverse engineer the formula and constants needed to create the correct ADC load.
    
    try{
        Const1=TrimConstant[bits][gain]['Const1']
        Const2=TrimConstant[bits][gain]['Const2']
        Const3=TrimConstant[bits][gain]['Const3']
    }
    catch(e){
        //console.log("entering catch block");
        console.log(e);
        //console.log("leaving catch block");
        console.log("ERROR, unknown bits of "+bits+" or gain of "+gain+" - ABORT")
        console.log(TrimConstant[18]);
        console.log(" ---")
        console.log(TrimConstant[18][1]);
        process.exit(112);
    }

    // calculate ADC Internal load resistance
    data[port]['Rl']=Const1*Math.abs(data[port]['adcV'])**2+Const2*Math.abs(data[port]['adcV'])+Const3;

    if (data[port]['R1'] >0){
        data[port]['I']=data[port]['adcV']/data[port]['R2'];
        data[port]['volt']=data[port]['I']*(data[port]['R1']+data[port]['R2']);
        data[port]['trueR2']=1/(1/data[port]['R2']+1/data[port]['Rl']);
        data[port]['trueI']=(data[port]['adcV'])/data[port]['trueR2'];
        data[port]['trueV']=data[port]['trueI']*(data[port]['R1']+data[port]['trueR2']);
    }else{
        data[port]['I']=data[port]['adcV']/data[port]['Rl'];
        data[port]['volt']=data[port]['adcV'];
        data[port]['trueV']=data[port]['adcV'];
    }
    //console.log("   port "+port+"  trueV: "+data[port]['trueV']);
} // adc2volt


function setOpt(port,option,val){ //No error checking, just set the value...
    data[port][option]=val;
    if (option == "bits"){
        data[port]['LSB']=(2*2.048)/(2**data[port]['bits'])
    }
} // setOpt

/********************************
* Prime the data array with values
*/

function setup(){
    var board=1
    var chip=1
    var channel=1
    var port;
    
    //Fill in values for all <maxport> ports, non existing ones get status of invalid (in readADC)
    for (port = 1; port <= maxport; port++) {
        data[port]=[];
        data[port]['bits']=BITS;
        data[port]['gain']=GAIN;
        data[port]['board']=board;
        data[port]['chip']=chip;
        data[port]['chipaddr']=addresses[board*2+chip-3];
        data[port]['channel']=channel;
        //console.log("port "+port+", board "+board+", chip "+chip+", channel "+channel+", addr idx: "+(board*2+chip-3)+" is 0x"+parseInt(data[port]['chipaddr'], 10).toString(16)+", bits: "+data[port]['bits']);
        data[port]['R1']=R1; // upper resistor in voltage divider
        data[port]['R2']=R2; // lower resistor in voltage divider
        data[port]['mV']=-999999
        data[port]['volt']=-999999
        data[port]['LSB']=(2*2.048)/(2**BITS)
        readADC(port);
        adc2volt(port); // to fill in rawVal and so on
        
        if (channel==4){
            channel=1;
            if (chip==2){
                chip=1;
                board+=1;
            }else{
                chip=2;
            }
        }else{
            channel+=1;
        }
    }
} // setup

/****************
* small sample on how to use it
*/

setup();
for (let port=1;port<=32;port++){
    setOpt(port,'gain',1);
    setOpt(port,'bits',18);
    if (data[port]['valid']==false){
        continue
    }
    readADC(port);
    console.log("Port "+port+": adcV="+data[port]['adcV']+", "+data[port]['trueV']+" Volt");
}
