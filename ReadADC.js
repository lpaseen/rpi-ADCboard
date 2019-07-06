/****************************************************************
* ReadADC.js
* Purpose: Proof of concept on how to read values from and configure the mcp3424
*          The code is targeted for a raspberry pi expansionboard that 
*          has 8 ports with a voltage divider allowing measuring of 0-14V
*
* Copyright: Peter Sjöberg
*
* License: GPL3
*
* 2019-02-06  Peter Sjoberg <peters-src AT techwiz DOT ca>
*	Created
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

// Adjust the following addresses as needed
var addresses={ 1 : '68', 2 : '69',   // first board
		3 : '6a', 4 : '6b',   // second board
	        5 : '6c', 6 : '6d',   // third board
	        7 : '6e', 8 : '6f' }; // fourth board

const R1=120000  // voltage divider top resistor in ohms
const R2=20000   // voltage divider bottom resistor in ohms

const maxPort=8; // this should be autodiscovered with a throw

var glob = require('glob');

//Below should not need to be changed

var port_data=[]; // this multidimensional array contains all values

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

var fs = require('fs');

(async() => {

    /********************************/
    // setup/init the env
    // required to be done before this script is to load the module, activate the device and change permission
    // the script "Setup_mcp3424.sh" does it but here it is for completeness.
    //    for address in $(i2cdetect -y  1|awk '/^60:/{print $10,$11,$12,$13,$14,$15,$16,$17}'|xargs -n1|grep -vE "UU|--");do
    //        echo mcp3424 0x$address|sudo tee -a /sys/bus/i2c/devices/i2c-1/new_device >/dev/null
    //    done
    //    sudo modprobe mcp3422
    //    sudo chown pi /sys/bus/i2c/devices/1-006[89a-f]/iio\:device[0-9]/*
    //
    function setup(){
	let bits=[];
	let scaleopt=[];
	var port=1;

	// setup all paths
	for (let addr= 1; addr < maxPort/4+1; addr ++) {
            for (let ch = 0; ch < 4; ch++) {
		port_data[port]={
		    'path_raw' : glob.sync('/sys/bus/i2c/devices/1-00'+addresses[addr]+'/iio:device?/in_voltage'+ch+"_raw")[0],
		    'path_scale' : glob.sync('/sys/bus/i2c/devices/1-00'+addresses[addr]+'/iio:device?/in_voltage'+ch+"_scale")[0],
		    // The following gets duplicated for each channel but that makes later coding less assumptive and easier/consistent
		    'path_sampleopt' : glob.sync('/sys/bus/i2c/devices/1-00'+addresses[addr]+'/iio:device?/sampling_frequency_available')[0],
		    'path_samplespeed' : glob.sync('/sys/bus/i2c/devices/1-00'+addresses[addr]+'/iio:device?/in_voltage_sampling_frequency')[0],
		    'path_scaleopt' : glob.sync('/sys/bus/i2c/devices/1-00'+addresses[addr]+'/iio:device?/in_voltage_scale_available')[0]
		}
		port_data[port]['sampleopt']= fs.readFileSync(port_data[port]['path_sampleopt'],'utf8').replace(/\n$/, '').trim().split(/\s+/);
		port_data[port]['sps']=fs.readFileSync(port_data[port]['path_samplespeed'],'utf8').replace(/\n$/, '');
		//get current bit resolution set in the ADC
		switch (port_data[port]['sps']){
		    case port_data[port]['sampleopt'][0] : port_data[port]['bits']=12; break;
		    case port_data[port]['sampleopt'][1] : port_data[port]['bits']=14; break;
		    case port_data[port]['sampleopt'][2] : port_data[port]['bits']=16; break;
		    case port_data[port]['sampleopt'][3] : port_data[port]['bits']=18; break;
		default : 
		    port_data[port]['bits']='unknown: '+port_data[port]['sps']; break;
		}
                port_data[port]['rawval']=fs.readFileSync(port_data[port]['path_raw'],'utf8').replace(/\n$/, ''); // Must read _raw before scale to get it right
		port_data[port]['scaleopt']=fs.readFileSync(port_data[port]['path_scaleopt'],'utf8').replace(/\n$/, '').trim().split(/\s+/);
		port_data[port]['scale']=fs.readFileSync(port_data[port]['path_scale'],'utf8').replace(/\n$/, '');
		//get current gain/pga setting set for this channel
		switch(port_data[port]['scale']){
		    case port_data[port]['scaleopt'][0] : port_data[port]['pga']=1; break;
		    case port_data[port]['scaleopt'][1] : port_data[port]['pga']=2; break;
		    case port_data[port]['scaleopt'][2] : port_data[port]['pga']=4; break;
		    case port_data[port]['scaleopt'][3] : port_data[port]['pga']=8; break;
		default:
		    port_data[port]['pga']='unknown: '+port_data[port]['scale'];
		}
		 // during setup all are set to same value, makes it possible to have calibration done with configurable values at some point.
		port_data[port]['R1']=R1;
		port_data[port]['R2']=R2;
		// get ready for next port
		port+=1;
	    } // for each channel
	} // for each address
    } // function setup

    function GetVal(port){
        port_data[port]['rawval']=fs.readFileSync(port_data[port]['path_raw'],'utf8').replace(/\n$/, '');
        port_data[port]['scale']=fs.readFileSync(port_data[port]['path_scale'],'utf8').replace(/\n$/, '');
	port_data[port]['mV']=port_data[port]['rawval']*port_data[port]['scale']*1000;
        port_data[port]['Rl']=2500000/port_data[port]['pga'];  // ADC load
        port_data[port]['trueR2']=1/(1/port_data[port]['R2']+1/port_data[port]['Rl']);
        port_data[port]['trueI']=(port_data[port]['rawval']*port_data[port]['scale'])/port_data[port]['trueR2'];
        port_data[port]['trueV']=port_data[port]['trueI']*(port_data[port]['R1']+port_data[port]['trueR2']);
    } // function GetVal

    /****************/
    // NOTE: this will take effect after next sample which may take up to 0.3 seconds!
    function setPGA(port){
	switch (port_data[port]['pga']) {
	    case 1: port_data[port]['scale']=port_data[port]['scaleopt'][0];break;
	    case 2: port_data[port]['scale']=port_data[port]['scaleopt'][1];break;
	    case 4: port_data[port]['scale']=port_data[port]['scaleopt'][2];break;
	    case 8: port_data[port]['scale']=port_data[port]['scaleopt'][3];break;
	default:
            console.log("ERROR: unknown pga "+port_data[port]['pga']+" expected 1,2,4 or 8");
	    port_data[port]['scale']='undef';
            return;
	}
	console.log("                 Setting port "+port+" pga to "+port_data[port]['pga']+" or LSB= "+port_data[port]['scale']*1000000+" uV");
        fs.writeFileSync(port_data[port]['path_scale'], port_data[port]['scale'], 'utf8');
    }; // setPGA
    
    /****************/
    // NOTE: this will take effect after next sample which may take up to 0.3 seconds!
    // NOTE2: this impacts the scale/pga so that needs to be updated also with a call to Setup
    function setBits(port){
	switch (port_data[port]['bits']) {
            case 12: port_data[port]['sps']=port_data[port]['sampleopt'][0];break;
            case 14: port_data[port]['sps']=port_data[port]['sampleopt'][1];break;
            case 16: port_data[port]['sps']=port_data[port]['sampleopt'][2];break;
            case 18: port_data[port]['sps']=port_data[port]['sampleopt'][3];break;
	default:
            console.log("ERROR: unknown bits "+port_data[port]['bits']+" expected 12,14,16 or 18");
	    port_data[port]['sps']='undef';
            return;
	}
	console.log("                 Setting port "+port+" bits to "+port_data[port]['bits']+" or SPS= "+port_data[port]['sps']+" samples per second");
        fs.writeFileSync(port_data[port]['path_samplespeed'], port_data[port]['sps'], 'utf8');
    }; // setBits

    /****************/
    // Adjust pga if needed
    // NOTE: this will take effect after next sample which may take up to 0.3 seconds!
    function AutoTune(port){
        var margin=(2**port_data[port]['bits'])*0.05; // within 5% of the min/max value
        var upper=(2**(port_data[port]['bits']-1)-margin);
        var lower=-upper;

        if (port_data[port]['pga'] > 1 && (port_data[port]['rawval'] > upper || port_data[port]['rawval'] < lower)){ // close to edge
            //console.log("---------------------------------------------------------------- lowering the pga from "+port_data[port]['pga']);
            if (port_data[port]['pga'] == 8){
                port_data[port]['pga']=4;
            }else if (port_data[port]['pga'] == 4){
                port_data[port]['pga']=2;
            } else {
                port_data[port]['pga']=1;
            }
            setPGA(port);
        } else if ( port_data[port]['pga'] < 8  && (port_data[port]['rawval'] < upper/2 && port_data[port]['rawval'] > lower/2)){  // can improve
            //console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ rasing the pga from "+port_data[port]['pga']);
            if (port_data[port]['pga'] == 1){
                port_data[port]['pga']=2;
            }else if (port_data[port]['pga'] == 2){
                port_data[port]['pga']=4;
            } else {
                port_data[port]['pga']=8;
            }            
            setPGA(port);
        }
    }; // AutoTune


    function showVal(port){
        console.log("\nPort    : "+port);
        console.log(" Raw value : "+port_data[port]['rawval']);
        console.log(" scale     : "+port_data[port]['scale']);
        console.log(" PGA       : "+port_data[port]['pga']);
        console.log(" mV        : "+port_data[port]['mV']);
	console.log(" trueV     : "+port_data[port]['trueV']);
	/* *
        console.log("DEBUG/Verification:");
        console.log(" R1       : "+port_data[port]['R1']);
        console.log(" R2       : "+port_data[port]['R2']);
        console.log(" Rl       : "+port_data[port]['Rl']);
        console.log(" I        : "+(port_data[port]['rawval']*port_data[port]['scaleval'])/port_data[port]['R2']);
        console.log(" trueR2   : "+port_data[port]['trueR2']);
        console.log(" trueI    : "+port_data[port]['trueI']);
        /* */
    }; // showVal

    /****************************************************************/
    // Main part

    setup(); // setup paths and load all values
    if (port_data[1]['bits'] != 18){ // just set one port since all ports have same bit count
        port_data[1]['bits'] = 18;
        setBits(1);
        await sleep(300);
        setup();
    }
    
    /****************/
    //read port values and print them out
    for (let i = 15; i > 0; i--) { // do a few  reads
        // Read values, show them and tune them in 3 different loops to improve what is shown on console
        for (let port = 1; port <= maxPort; port++) { // only read the first 4 ports
	    GetVal(port); // this reads the values for this port
        }
        process.stdout.write('\x1B[2J\x1B[0f');
        for (let port = 1; port <= maxPort; port++) { // only read the first 4 ports
	    showVal(port); // this prints them out on console.log
        }
        for (let port = 1; port <= maxPort; port++) { // only read the first 4 ports
	    AutoTune(port); // Adjust gain if needed
        }
        if (i > 0){
            await sleep(3000); // wait for next sample
            //console.log("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n");
        }
    }
})();

