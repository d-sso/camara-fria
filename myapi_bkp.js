/**
 * myapi.js
 * 
 * @version 1.1 - updated for Express 4.x : April 2015
 *
 * 
 * DESCRIPTION:
 * a "HELLO WORLD" server-side application to demonstrate running a node 
 * API Appserver on a Raspberry Pi to access IOs
 * Uses the Express node packages. 
 * 
 * 
 * @throws none
 * @see nodejs.org
 * @see express.org
 * 
 * @author Robert Drummond
 * (C) 2013 PINK PELICAN NZ LTD
 */

var http      = require('http');
var express   = require('express');
var gpio      = require('rpio');
var fs		  = require('fs');
var mysql	  = require('mysql');
var app       = express();

var htmlRoot = '/webPage';
// output port values for our example
var outputs = [ { pin: '11', gpio: '17', value: 0 }
		,{ pin: '13', gpio: '18', value: 1 }
               ];
var basePathOneWire = '/sys/bus/w1/devices/';
var tempSensors = ['28-00044cf31aff/w1_slave'];
var setpoint = 20;

// Function to read the temperature value
function readTemperature(sensor){
	tempFile = fs.readFileSync(basePathOneWire + sensor,'UTF8');
	tempData = tempFile.split("\n")[1].split(" ")[9];
	temperature = Number(tempData.substring(2));
	temperature = temperature/1000;
	return temperature;
};

//Connect to mySQL
var connection = mysql.createConnection({
		host:'localhost',
		user:'root',
		password:'raspberry',
		database:'dadosProcesso'
});
connection.connect();
console.log('Connected to mySQL database');

var prevTemp = setpoint;

function updateTemperatureValue(temperature){
	if(prevTemp!=temperature){
		prevTemp = temperature;
		connection.query('insert into temperatura(value,setpoint) values (' + temperature + ','+ setpoint + ');', function(err,rows,fields){
			if(err){
				console.log('Error writing to DB');
				console.log(err);}
			});
	}
};

//Initialize the GPIO and open the ports as outputs
for (i in outputs){
  console.log('opening GPIO port ' + outputs[i].gpio + ' on pin '
    + outputs[i].pin + ' as output');
  gpio.open(outputs[i].pin,gpio.OUTPUT,gpio.LOW,function(err){if(err){throw err;}});
}

setInterval( function() {
	temperature = readTemperature(tempSensors[0]);
	if(temperature > setpoint){
		outputs[0].value = 1;
	}
	else{
		outputs[0].value = 0;
	}
	gpio.write(outputs[0].pin,Number(outputs[0].value));
	updateTemperatureValue(temperature);
},5000);

// ------------------------------------------------------------------------
// configure Express to serve index.html and any other static pages stored 
// in the home directory
//

app.use("/",express.static(__dirname+htmlRoot));
console.log(__dirname+htmlRoot);

// Express route for requests on temperature data
app.get('/temperatureData',function(req,res){
	connection.query('select * from temperatura where ts > (NOW() - interval 1 day)',function(err,rows){
		if(!err){
			res.json(rows);
		}
	});
});

// Express route for requests on setpoint
app.get('/setpoint',function(req,res){
	test = parseFloat(req.query.sp);
	if(!isNaN(test)){
		setpoint = test;
	}
	res.json({setpoint: setpoint});
});

// Express route for any other unrecognised incoming requests
app.get('*', function (req, res) {
  res.status(404).send('Unrecognised API call');
});

// Express route to handle errors
app.use(function (err, req, res, next) {
  if (req.xhr) {
    res.status(500).send('Oops, Something went wrong!');
  } else {
    next(err);
  }
}); // apt.use()

// -----------------------------------------------------------------------
// Stop the server
//
process.on('SIGINT',function() {
	var i;
	console.log('Shutting down');
	for(i in outputs){
		gpio.close(outputs[i].pin);
	}
	connection.end();
	process.exit();
});

// ------------------------------------------------------------------------
// Start Express App Server
//
app.listen(3000);
console.log('App Server is listening on port 3000');
