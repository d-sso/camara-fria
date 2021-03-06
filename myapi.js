/**
 * myapi.js
 * 
 * @version 0.0 - first version
 *
 * 
 * DESCRIPTION:
 * a test to control temperature and make data available through a web page
 * 
 * 
 * @throws none
 * @see nodejs.org
 * @see express.org
 * @see rpio
 * @see msql
 * 
 * @author Vinicius Alves
 */

var http      = require('http');
var express   = require('express');
var gpio      = require('rpio');
var fs		  = require('fs');
var mysql	  = require('mysql');
var app       = express();

// root path with HTML files
var htmlRoot = '/webPage';
// output ports to be used
var outputs = JSON.parse(fs.readFileSync('config/outputs.json'));
// base physical path to fetch data from one wire devices
var basePathOneWire = '/sys/bus/w1/devices/';
// the id of the devices read
var tempSensors = JSON.parse(fs.readFileSync('config/tempSensors.json'))
// the db connection config
var dbConn = JSON.parse(fs.readFileSync('config/dbConnection.json'))

// Function to read the temperature value
function readTemperature(sensor){
	try{
		tempFile = fs.readFileSync(basePathOneWire + sensor,'UTF8');
		tempData = tempFile.split("\n")[1].split(" ")[9];
		temperature = Number(tempData.substring(2));
		temperature = temperature/1000;
		return temperature;
	}catch(err){
		console.log(new Date().toLocaleString() + ' - Error reading from sensor ' + sensor);
	}
};

//Connect to mySQL
var connection = mysql.createConnection(dbConn);
connection.connect();
console.log(new Date().toLocaleString() + ' - Connected to mySQL database');

function updateTemperatureValueOnBD(temperature,sp,id){
	connection.query('insert into temperatura(value,setpoint,idSensor) values (' + temperature + ','+ sp + ','+id+');', 
		function(err,rows,fields){
			if(err){
				console.log(new Date().toLocaleString() + ' - Error writing to DB');
				console.log(err);
			}
		});
};

//Initialize the GPIO and open the ports as outputs
for (i in outputs){
  console.log(new Date().toLocaleString() + ' - opening GPIO port ' + outputs[i].gpio + ' on pin '
    + outputs[i].pin + ' as output');
  gpio.open(outputs[i].pin,gpio.OUTPUT,gpio.LOW,function(err){if(err){throw err;}});
}

//Function to handle the periodic logic updates
function updateReadings() {
	for(i in tempSensors){
		temperature = readTemperature(tempSensors[i].sensor);
		//If temperature below setpoint, check if triggers event
		if(temperature > tempSensors[i].setpoint){
			//If last event is recent, does not triggers event
			if(((new Date()).getTime()-(new Date(tempSensors[i].lastOn).getTime())) > tempSensors[i].minOffTime){
				outputs[i].value = 1;
			}
		}
		else{
			outputs[i].value = 0;
		}
		if(outputs[i].value == 1){
			tempSensors[i].lastOn = new Date();
		}
		gpio.write(outputs[i].pin,Number(outputs[i].value));
		tempSensors[i].currValue = temperature;
		tempSensors[i].currTs = new Date().toLocaleString();
		if(Math.abs(tempSensors[i].currValue - tempSensors[i].prevValue)>tempSensors[i].deadband){
			updateTemperatureValueOnBD(temperature,tempSensors[i].setpoint,tempSensors[i].id);
			tempSensors[i].prevValue = tempSensors[i].currValue;
		}
	}
};

setInterval(updateReadings,5000);

// ------------------------------------------------------------------------
// configure Express to serve index.html and any other static pages stored 
// in the home directory
//

app.use("/",express.static(__dirname+htmlRoot));
console.log((new Date().toLocaleString()) + ' - HTML root: ' + __dirname+htmlRoot);

// Express route for requests on temperature data
// TODO! colocar selecao de IDS
app.get('/temperatureData',function(req,res){
	id = parseFloat(req.query.id);
	if(!isNaN(id)){
		connection.query('select * from temperatura where ts > (NOW() - interval 1 day) and id=' + id,function(err,rows){
			if(!err){
				for(var i in tempSensors){
					if(tempSensors[i].id == id){
						rows.push({
							ts: tempSensors[i].currTs,
							value: tempSensors[i].currValue,
							setpoint: tempSensors[i].setpoint,
							idSensor: id
						});
					}
				}
				res.json(rows);
			}
		});
	}
	else{
		connection.query('select * from temperatura where ts > (NOW() - interval 1 day)',function(err,rows){
			if(!err){
				for(var i in tempSensors){
					rows.push({
						ts: tempSensors[i].currTs,
						value: tempSensors[i].currValue,
						setpoint: tempSensors[i].setpoint,
						idSensor: id
					});
				}
				res.json(rows);
			}
		});
	}
});

// Express route for requests on setpoint
app.get('/setpoint',function(req,res){
	test = parseFloat(req.query.sp);
	id = parseFloat(req.query.id);
	if(!isNaN(test) && !isNaN(id)){
		if(id<tempSensors.length){
			tempSensors[id].setpoint = test;
			updateTemperatureValueOnBD(tempSensors[id].currValue,tempSensors[id].setpoint,tempSensors[id].id);
			res.json(tempSensors[id]);
			return;
		}
	}
	res.json(tempSensors);
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
});

// -----------------------------------------------------------------------
// Stop the server
//
process.on('SIGINT',function() {
	var i;
	console.log((new Date().toLocaleString()) + ' - Shutting down');
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
console.log(new Date().toLocaleString() + ' - App Server is listening on port 3000');
