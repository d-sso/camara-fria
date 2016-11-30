'use strict';
var app = angular.module('myApp', ['chart.js','ngMaterial', 'ngMessages']);
app.controller('myCtrl', ['$scope','$log','$http','$filter',function($scope,$log,$http,$filter) {
	//myCtrl Controller function
    $scope.http = $http;
    $scope.log = function(message) {
      $log.debug(message);
    };
    var localVals = [{"Name":"SINUSOID", "Timestamp":"now","Value":0,"Good":"true"}];
  	$scope.myVals = localVals;
  	$scope.myTags = [
  	                 	"Temperatura",
  	                 	"Setpoint"
  					];
  	
  	$scope.filter = $filter;
  	//Variaveis para o chart
  	$scope.labels = [];
	$scope.series = ['Temperatura','Setpoint'];
	$scope.data = [];
	$scope.datasetOverride =  [];
	$scope.datasetOverride.push({ yAxisID: 'y-axis-1' },{ yAxisID: 'y-axis-1' });
	$scope.options = {
		scales: {
	      	yAxes: [{
		          id: 'y-axis-1',
		          type: 'linear',
		          display: true,
		          position: 'left'
		        }],
		    xAxes:[{
				  type: 'time',
				  time: {
					  displayFormats: {
						  minute: 'h:mm:ss'
					  }
				  }
			}]
	    }
     };
	
	$scope.change = getValues; 
	
	function processChange(){
 	};
 	
 	$scope.$watchCollection('searchText',processChange);
 	
 	$scope.$watchCollection('myTag',getValues); 
 			
 	function getValues() {
 		$scope.log("tags changed");
 		
 	 	$scope.labels = [];
 		$scope.myVals = [];
		$scope.data = [];
		$scope.http({
						url:"/temperatureData"
						,method:"GET"
			}).then(
			function(response) {
				var tempData = [];
				var spData = [];
				var ts = [];
				angular.forEach(response.data,function(valueRow,keyRow){
					$scope.labels.push(valueRow.ts);
					tempData.push(valueRow.value);
					spData.push(valueRow.setpoint);
				});
				$scope.data = [tempData,spData];
			}
		);
};
}]);
