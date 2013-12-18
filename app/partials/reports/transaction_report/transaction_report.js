angular.module('kpk.controllers').controller('reportTransactionController', function($scope, $q, $filter, connect){

	$scope.report = {};
	var creditors = {tables:{'creditor':{columns:['id', 'text']},
						    'creditor_group':{columns:['account_id']}
						   },
					join:  ['creditor.creditor_group_id=creditor_group.id']
				   };

	var debitors = {tables:{'debitor':{columns:['id', 'text']},
						    'debitor_group':{columns:['account_id']}
						   },
					join:  ['debitor.group_id=debitor_group.id']
				   };

	var debitorGroup = {tables:{'debitor_group':{columns:['id', 'name', 'account_id']}}};

	var creditorGroup = {tables:{'creditor_group':{columns:['id', 'group_txt', 'account_id']}}};

	$scope.models = [];

	$scope.data = {};

	$scope.model = {};
	$scope.model.transReport = [];

	$scope.oneAtATime = true;

	var models = {};

	var dataview;;

	var names = ['debitors', 'creditors', 'debitorGroup', 'creditorGroup'];

	var grid;	
	var sort_column = "trans_id";
	var columns = [
		{id: 'id', name: "ID", field: 'id', sortable: true},
	    {id: 'trans_id', name: "Transaction ID", field: 'trans_id', sortable: true},
	    {id: 'trans_date', name: 'Date', field: 'trans_date', formatter: formatDate},
	    {id:'account_number', name:'Account', field:'account_number'},
	    {id: 'debit', name: 'Debit', field: 'debit', groupTotalsFormatter: totalFormat, sortable: true, maxWidth:100},
	    {id: 'credit', name: 'Credit', field: 'credit', groupTotalsFormatter: totalFormat, sortable: true, maxWidth: 100},
	    {id: 'monnaie', name: 'Currency', field: 'name'},
	    {id: 'service', name: 'Service', field: 'service_txt'},
	    {id: 'names', name: 'Posted By', field: 'names'}
	];
  	var options = {
	    enableCellNavigation: true,
	    enableColumnReorder: true,
	    forceFitColumns: true,
	    rowHeight: 30
  	};

	$q.all([connect.req(debitors), connect.req(creditors), connect.req(debitorGroup), connect.req(creditorGroup)]).then(init);

	/*
	*une zone pour fonction
	*initialisations
	*donnees
	*/

	function init (records){
		models[names[0]] = records[0];
		models[names[1]] = records[1];
		models[names[2]] = records[2];
		models[names[3]] = records[3];
		for(var key in models){
			mapper(models[key].data);
		}
	}

	$scope.fill = function(){
		if($scope.data.type == 'I'){			
			if($scope.data.dc == 'D'){

				$scope.model.chooses = models.debitors.data;

			}else if($scope.data.dc == 'C'){

				$scope.model.chooses = models.creditors.data;
			}

		}else if($scope.data.type == 'G'){
			if($scope.data.dc == 'D'){

				$scope.model.chooses = models.creditors.data;

			}else if($scope.data.dc == 'C'){

				$scope.model.chooses = models.creditors.data;
			}
		}
	}

	function mapper(collection){
		collection.map(function(item){
			item.text = item.text || item.group_txt || item.name;
		});
	}

	$scope.populate = function (){

		if($scope.data.type == 'I'){
			connect.MyBasicGet('/reports/transReport/?'+JSON.stringify({id:$scope.model.selected.id, type:$scope.data.dc, ig:$scope.data.type})).then(function(values){
	          $scope.model['transReport'] = values;
	          popul();
		    });			
		}else if($scope.data.type == 'G'){		

			connect.MyBasicGet('/reports/transReport/?'+JSON.stringify({id:$scope.model.selected.id, type:$scope.data.dc, account_id:$scope.model.selected.account_id, ig:$scope.data.type})).then(function(values){
	          $scope.model['transReport'] = values;
	          popul();
		    });	


		} 	
    }	  	  	

  	function popul() {

  		var groupItemMetadataProvider = new Slick.Data.GroupItemMetadataProvider();
      	dataview = new Slick.Data.DataView({
	        groupItemMetadataProvider: groupItemMetadataProvider,
	        inlineFilter: true
      	});
      	grid = new Slick.Grid('#transaction_report_grid', dataview, columns, options);
      	grid.registerPlugin(groupItemMetadataProvider);
	    
	    dataview.onRowCountChanged.subscribe(function (e, args) {
	        grid.updateRowCount();
	        grid.render();
      	});
      	
      	dataview.onRowsChanged.subscribe(function (e, args) {
	        grid.invalidateRows(args.rows);
	        grid.render();
      	});

      	dataview.beginUpdate();
      	dataview.setItems($scope.model.transReport);
	    dataview.endUpdate();
      	groupByService();
    }

    function groupByService() {
	    dataview.setGrouping({
	      getter: "service_txt",
	      formatter: function (g) {
	        return "<span style='font-weight: bold'>" + g.value + "</span> (" + g.count + " transactions)</span>";
	      },
	      aggregators: [
	        new Slick.Data.Aggregators.Sum("debit"),
	        new Slick.Data.Aggregators.Sum("credit")
	      ],
	      aggregateCollapsed: false
	    });
  	}

  	function totalFormat(totals, column) {
		var format = {};
		format['Credit'] = '#02BD02';
		format['Debit'] = '#F70303';

		var val = totals.sum && totals.sum[column.field];
		if (val !== null) {
		  return "<span style='font-weight: bold; color:" + format[column.name] + "'>" + ((Math.round(parseFloat(val)*100)/100)) + "</span>";
		}
		return "";
    }

    function formatDate (row, col, item) {
    	return $filter('date')(item);
  	}
});