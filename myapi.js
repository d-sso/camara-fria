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
var outputs = [ { pin: '11', gpio: '17', value: 0 }
               ];
// base physical path to fetch data from one wire devices
var basePathOneWire = '/sys/bus/w1/devices/';
// the id of the devices read
var tempSensors = [{
						sensor: '28-00044cf31aff/w1_slave',
						name:'Cima',
						id:0,
						setpoint:20,
						prevValue:20,
						currValue:20,
						deadband:0.5,
						currTs: 0
					}];

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

function updateTemperatureValueOnBD(temperature,sp,id){
	connection.query('insert into temperatura(value,setpoint,idSensor) values (' + temperature + ','+ sp + ','+id+');', 
		function(err,rows,fields){
			if(err){
				console.log('Error writing to DB');
				console.log(err);}
		});
};

//Initialize the GPIO and open the ports as outputs
for (i in outputs){
  console.log('opening GPIO port ' + outputs[i].gpio + ' on pin '
    + outputs[i].pin + ' as output');
  gpio.open(outputs[i].pin,gpio.OUTPUT,gpio.LOW,function(err){if(err){throw err;}});
}

//Function to handle the periodic logic updates
function updateReadings() {
	for(i in tempSensors){
		temperature = readTemperature(tempSensors[i].sensor);
		if(temperature > tempSensors[i].setpoint){
			outputs[i].value = 1;
		}
		else{
			outputs[i].value = 0;
		}
		gpio.write(outputs[i].pin,Number(outputs[i].value));
		tempSensors[i].currValue = temperature;
		tempSensors[i].currTs = new Date();
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
console.log(__dirname+htmlRoot);

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
