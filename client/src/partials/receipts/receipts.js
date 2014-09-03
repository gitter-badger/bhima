//TODO Debtor table currently has no personal information - this strictly ties debtors to patients
// (or some existing table) - a reverse lookup from debtor / creditor ID to recipient is needed.
angular.module('bhima.controllers')
.controller('receipts', [
  '$scope',
  '$routeParams',
  '$q',
  'validate',
  'exchange',
  'appstate',
  function ($scope, $routeParams, $q, validate, exchange, appstate) {

    var templates, dependencies = {},
        origin       = $scope.origin = $routeParams.originId,
        invoiceId    = $scope.invoiceId = $routeParams.invoiceId,
        process      = {};

    if (!(origin && invoiceId)) { throw new Error('Invalid parameters'); }

    $scope.timestamp = new Date();

    dependencies.recipient = {
      required: true
    };

    dependencies.invoice = {
      required: true,
      query: {
        tables: {
          'sale' : {
            columns: ['uuid', 'cost', 'currency_id', 'debitor_uuid', 'seller_id', 'invoice_date', 'note', 'project_id', 'reference']
          },
          'project' : {
            columns : ['abbr']
          }
        },
        join : ['sale.project_id=project.id'],
        // where: [origin + '.id=' + invoiceId]
        where: ['sale.uuid=' + invoiceId]
      }
    };

    dependencies.currency = {
      query : {
        tables : {
          'currency' : {
            columns : ['id', 'symbol']
          }
        }
      }
    };

    dependencies.ledger = {
      identifier: 'inv_po_id'
    };

    dependencies.location = {
      required: true
    };

    //TODO sale_item hardcoded - have a map form originId to table name, item table name, recipient table name
    dependencies.invoiceItem = {
      required: true,
      query: {
        tables: {
          inventory : {
            columns: ['uuid', 'code', 'text']
          },
          sale_item : {
            columns: ['uuid', 'quantity', 'debit', 'credit', 'transaction_price', 'sale_uuid']
          }
        },
        join: ['sale_item.inventory_uuid=inventory.uuid'],
        where: ['sale_item.sale_uuid=' + invoiceId]
      }
    };

    function processCaution (caution_uuid) {
      dependencies.caution = {
        required: true,
        query:  {
          tables: {
            caution: { columns: ['reference', 'value', 'debitor_uuid', 'project_id', 'currency_id', 'date'] },
            patient : {columns : ['first_name', 'last_name', 'current_location_id']}
          },
          join : ['caution.debitor_uuid=patient.debitor_uuid'],
          where: ['caution.uuid=' + caution_uuid]
        }
      };
      validate.process(dependencies, ['caution']).then(buildCaution);
    }

    function buildCaution (model) {
      dependencies.location = {
        required: true,
        query: '/location/' + model.caution.data[0].current_location_id
      };

      validate.process(dependencies, ['location'])
      .then(cautionInvoice);
    }

    function getLocation(locationUuid) {
      return validate.process({ query : 'location/' + locationUuid});
    }

    function processTransfer(uuid) {
      var depends = {};

      depends.enterprise = {
        query : {
          tables : {
            'enterprise' : {columns : ['id', 'name', 'phone', 'email', 'location_id' ]},
            'project'    : {columns : ['name', 'abbr']}
          },
          join : ['enterprise.id=project.enterprise_id']
        }
      };

      depends.transfer = {
        required: true,
        query:  {
          tables: {
            primary_cash: { columns: ['cost', 'project_id', 'currency_id', 'date'] },
            user : {columns : ['first', 'last']},
            account : {columns : ['account_txt']}
          },
          join : ['primary_cash.user_id=user.id', 'primary_cash.account_id=account.id'],
          where: ['primary_cash.uuid=' + uuid]
        }
      };

      validate.process(depends)
        .then(function (model) { return getLocation(model.enterprise[0].location_id); })
        .then(transfertInvoice);
    }

    function processConvention (convention_uuid) {
      dependencies.convention = {
        required: true,
        query:  {
          tables: {
            primary_cash: { columns: ['reference', 'cost', 'project_id', 'currency_id', 'date'] },
            primary_cash_item : {columns : ['debit', 'credit']},
            account : {columns : ['account_txt']},
            project : {columns : ['name', 'abbr']},
            enterprise : {columns : ['phone', 'email', 'location_id']},
            sale       : {columns : ['note']}
          },
          join : ['primary_cash.account_id=account.id', 'primary_cash.uuid=primary_cash_item.primary_cash_uuid', 'project.id=primary_cash.project_id', 'enterprise.id=project.enterprise_id', 'sale.uuid=primary_cash_item.inv_po_id'],
          where: ['primary_cash.uuid=' + convention_uuid]
        }
      };

      validate.process(dependencies, ['convention'])
        .then(buildConventionInvoice);
    }

    function processCash(requestId) {
      dependencies.cash = {
        required: true,
        query:  {
          tables: {
            cash: { columns: ['uuid', 'date', 'cost', 'deb_cred_uuid', 'currency_id'] },
            cash_item: { columns: ['cash_uuid', 'allocated_cost', 'invoice_uuid'] },
            sale: { columns : ['reference']}
          },
          join: ['cash_item.cash_uuid=cash.uuid', 'cash_item.invoice_uuid=sale.uuid'],
          where: ['cash_item.cash_uuid=' + requestId]
        }
      };

      validate.process(dependencies, ['cash'])
      .then(buildInvoiceQuery);
    }

    function processConsumption() {
      dependencies = {};

      dependencies.consumption = {
        query : {
          tables : {
            consumption : {
              columns : ['uuid', 'depot_uuid', 'date', 'document_id', 'tracking_number', 'quantity']
            },
            stock : {
              columns : ['inventory_uuid', 'expiration_date', 'lot_number']
            },
            inventory : {
              columns : ['code', 'text', 'consumable']
            }
          },
          where : ['consumption.document_id='+invoiceId],
          join : [
            'stock.tracking_number=consumption.tracking_number',
            'stock.inventory_uuid=inventory.uuid'
          ]
        }
      };

      validate.process(dependencies).then(fetchReferences);
    }

    // FIXME All the hardcoded references
    function fetchReferences(model) {
      var depotId = model.consumption.data[0].depot_uuid;
      var invoiceRef = model.consumption.data[0].document_id;

      dependencies.invoice = {
        query : {
          tables : {
            sale : {
              columns : ['reference', 'cost', 'debitor_uuid', 'invoice_date']
            },
            project : {
              columns : ['abbr']
            }
          },
          where : ['sale.uuid='+invoiceRef],
          join : ['sale.project_id=project.id']
        }
      };

      dependencies.depot = {
        query : {
          tables : {
            depot : {
              columns : ['uuid', 'reference', 'text']
            }
          },
          where : ['depot.uuid=' + depotId]
        }
      };

      validate.process(dependencies).then(consumptionPatient);
    }

    // FIXME De-couple methods with promises
    function consumptionPatient(model) {
      var debtorId = model.invoice.data[0].debitor_uuid;

      dependencies.patient = {
        query : {
          tables : {
            patient : {
              columns : ['reference', 'first_name', 'last_name', 'dob', 'current_location_id', 'registration_date']
            },
            debitor : {
              columns : ['group_uuid']
            },
            debitor_group : {
              columns : ['name', 'account_id']
            },
            project : {
              columns : ['abbr']
            }
          },
          where : ['patient.debitor_uuid=' + debtorId],
          join : [
            'patient.debitor_uuid=debitor.uuid',
            'debitor.group_uuid=debitor_group.uuid',
            'patient.project_id=project.id'
          ]
        }
      };

      validate.process(dependencies).then(function (consumptionModel) {
        angular.extend($scope, consumptionModel);

        $scope.recipient = consumptionModel.patient.data[0];
        $scope.recipient.hr_id = $scope.recipient.abbr + $scope.recipient.reference;
        $scope.depot = consumptionModel.depot.data[0];

        $scope.invoice = consumptionModel.invoice.data[0];
        $scope.invoice.hr_id = $scope.invoice.abbr + $scope.invoice.reference;
      });
    }

    function processMovement() {
      dependencies = {};

      dependencies.movement = {
        query : {
          tables : {
            depot : {
              columns : ['reference']
            },
            movement : {
              columns : ['uuid', 'depot_entry', 'depot_exit', 'tracking_number', 'quantity', 'date']
            },
            stock : {
              columns : ['inventory_uuid', 'tracking_number', 'expiration_date', 'entry_date', 'lot_number']
            },
            inventory : {
              columns : ['code', 'text']
            }
          },
          where : ['movement.document_id='+invoiceId],
          join : [
            'depot.uuid=movement.depot_exit',
            'movement.tracking_number=stock.tracking_number',
            'stock.inventory_uuid=inventory.uuid'
          ]
        }
      };

      validate.process(dependencies).then(fetchDepot);
    }

    // Hack to get around not being able to perform any join through connect
    function fetchDepot(model) {
      var depot_entry = model.movement.data[0].depot_entry;
      var depot_exit = model.movement.data[0].depot_exit;

      dependencies.depots = {
        query : {
          identifier : 'uuid',
          tables : {
            depot : {
              columns : ['uuid','reference', 'text']
            }
          },
          where : ['depot.uuid=' + depot_exit, 'OR', 'depot.uuid=' + depot_entry]
        }
      };

      validate.process(dependencies)
      .then(function (depotModel) {
        angular.extend($scope, depotModel);
        $scope.depotEntry = depotModel.depots.get(depot_entry);
        $scope.depotExit = depotModel.depots.get(depot_exit);

      });
    }

    function processSale() {
      validate.process(dependencies, ['invoice', 'invoiceItem'])
      .then(buildRecipientQuery);
    }

    // TODO
    //   Many of these fns return validate.process(x, y)
    // which is a promise.  For this reason, it makes 
    // sense to change these functions from processPurchase calling
    // the next function, calling the next function, calling the next,
    // etc, to something like :
    //   wrapper(invoiceID)
    //   .then(downloadPurchase)
    //   .then(processPurhcaseParties)
    //   .then(otherFunction)
    //   .catch(handler)
    //   .finally();

    function processPurchase (invoiceId) {
      var dependencies = {};

      dependencies.purchase = {
        query : {
          identifier : 'uuid',
          tables : {
            'purchase' : {
              columns : ['uuid', 'reference', 'project_id', 'cost', 'currency_id', 'creditor_uuid', 'purchase_date', 'note', 'employee_id']
            },
            'purchase_item' : {
              columns : ['inventory_uuid', 'purchase_uuid', 'quantity', 'unit_price', 'total']
            },
            'inventory' : {
              columns : ['code', 'text']
            },
            'project' : {
              columns : ['abbr']
            }
          },
          join : [
            'purchase.uuid=purchase_item.purchase_uuid',
            'purchase_item.inventory_uuid=inventory.uuid',
            'purchase.project_id=project.id'
          ],
          where : ['purchase_item.purchase_uuid=' + invoiceId]
        }
      };

      function processPurchaseParties(model) {
        var creditor = model.purchase.data[0].creditor_uuid;
        var employee = model.purchase.data[0].employee_id;

        dependencies.supplier = {
          query : {
            tables : {
              creditor : { columns : ['group_uuid'] },
              supplier : { columns : ['uuid', 'name', 'location_id', 'email', 'fax', 'note', 'phone', 'international'] }
            },
            join : ['creditor.uuid=supplier.creditor_uuid'],
            where : ['creditor.uuid=' + creditor]
          }
        };

        dependencies.employee = {
          query : {
            tables : {
              employee : { columns : ['name', 'code', 'dob', 'creditor_uuid'] }
            },
            where : ['employee.id=' + employee]
          }
        };

        validate.process(dependencies, ['supplier', 'employee']).then(processPurchaseDetails);
      }

      function processPurchaseDetails(model) {
        var locationId = model.supplier.data[0].location_id;

        dependencies.supplierLocation = {
          query : '/location/' + locationId
        };

        validate.process(dependencies, ['supplierLocation']).then(initialisePurchase);
      }

      function initialisePurchase(model) {
        $scope.model = model;
        console.log('tout ce quo a', model);
        // FIXME : This is not ideal  Why download all data
        // if we are only going to use data[0]?
        $scope.supplier = model.supplier.data[0];
        $scope.employee = model.employee.data[0];
        $scope.purchase = model.purchase.data[0];
        $scope.supplierLocation = model.supplierLocation.data[0];
      }
      validate.process(dependencies).then(processPurchaseParties);      
    }
    

    function processCredit(invoiceId) {
      dependencies = {};
      dependencies.credit = {
        required: true,
        query: {
          tables: {
            credit_note: { columns: ['uuid', 'cost', 'debitor_uuid', 'seller_id', 'sale_uuid', 'note_date', 'description'] },
            patient: { columns: ['first_name', 'last_name', 'current_location_id', 'reference'] },
            project: { columns: ['abbr'] }
          },
          join: ['credit_note.debitor_uuid=patient.debitor_uuid'],
          where: ['credit_note.uuid=' + invoiceId]
        }
      };
      validate.process(dependencies, ['credit']).then(buildCreditRecipient);
    }

    function processPatient() {
      dependencies.recipient.query = {
        tables: {},
        where: [
          'patient.uuid=' + invoiceId
        ]
      };

      dependencies.recipient.query.tables.patient = {
        columns: ['uuid', 'reference', 'first_name', 'last_name', 'dob', 'current_location_id', 'debitor_uuid', 'registration_date']
      };

      dependencies.recipient.query.tables.project = {
        columns: ['abbr']
      };


      dependencies.recipient.query.join = ['patient.project_id=project.id'];

      validate.process(dependencies, ['recipient'])
      .then(buildPatientLocation);
    }

    function processConfirmPurchase (identifiant){
      var dependencies = {};
      dependencies.enterprise = {
        query : {
          tables : {
            'enterprise' : {columns : ['id', 'name', 'phone', 'email', 'location_id' ]},
            'project'    : {columns : ['name', 'abbr']}
          },
          join : ['enterprise.id=project.enterprise_id']
        }
      };

      dependencies.purchase = {
        query : {
          identifier : 'uuid',
          tables : {
            purchase : { columns : ['uuid', 'reference', 'cost', 'creditor_uuid', 'employee_id', 'project_id', 'purchase_date', 'note'] },
            employee : { columns : ['code', 'name'] },
            project : { columns : ['abbr'] }
          },
          join : ['purchase.project_id=project.id', 'purchase.employee_id=employee.id'],
          where : ['purchase.uuid='+identifiant]
        }
      };

      validate.process(dependencies)
      .then(getLocations)
      .then(polish)
      .catch(function (err) {
        console.log('error pendant la genaration de la facture');
      });

      function getLocations (model) {
        dependencies.location = {};
        dependencies.location.query = 'location/' +  model.enterprise.data[0].location_id;
        return validate.process(dependencies, ['location']);
      }

      function polish (model) {
        $scope.invoice = {};
        $scope.invoice.uuid = identifiant;
        $scope.invoice.enterprise_name = model.enterprise.data[0].name;
        $scope.invoice.village = model.location.data[0].village;
        $scope.invoice.sector = model.location.data[0].sector;
        $scope.invoice.phone = model.enterprise.data[0].phone;
        $scope.invoice.email = model.enterprise.data[0].email;
        $scope.invoice.name = model.purchase.data[0].name;
        $scope.invoice.purchase_date = model.purchase.data[0].purchase_date;
        $scope.invoice.reference = model.purchase.data[0].abbr + model.purchase.data[0].reference;
        $scope.invoice.employee_code = model.purchase.data[0].code;
        $scope.invoice.cost = model.purchase.data[0].cost;
      }
    }

    function processServiceDist (identifiant){
      var dependencies = {};
      dependencies.enterprise = {
        query : {
          tables : {
            'enterprise' : {columns : ['id', 'name', 'phone', 'email', 'location_id' ]},
            'project'    : {columns : ['name', 'abbr']}
          },
          join : ['enterprise.id=project.enterprise_id']
        }
      };

      dependencies.distribution= {
        query : {
          identifier : 'uuid',
          tables : {
            consumption : { columns : ['quantity', 'date', 'uuid'] },
            consumption_service : { columns : ['service_id'] },
            service : {columns : ['name']},
            stock : {columns : ['tracking_number']},
            inventory : {columns : ['text', 'purchase_price']},
            project : { columns : ['abbr'] }
          },
          join : ['consumption.uuid=consumption_service.consumption_uuid', 'consumption_service.service_id=service.id', 'consumption.tracking_number=stock.tracking_number', 'stock.inventory_uuid=inventory.uuid', 'service.project_id=project.id'],
          where : ['consumption.document_id='+identifiant]
        }
      };

      validate.process(dependencies)
      .then(getLocations)
      .then(polish)
      .catch(function (err) {
        console.log('error pendant la genaration de la facture');
      });

      function getLocations (model) {
        console.log('notre model', model);
        dependencies.location = {};
        dependencies.location.query = 'location/' +  model.enterprise.data[0].location_id;
        return validate.process(dependencies, ['location']);
      }

      function polish (model) {
        $scope.records = model.distribution.data;
        $scope.invoice = {};
        $scope.invoice.uuid = identifiant;
        $scope.invoice.enterprise_name = model.enterprise.data[0].name;
        $scope.invoice.village = model.location.data[0].village;
        $scope.invoice.sector = model.location.data[0].sector;
        $scope.invoice.phone = model.enterprise.data[0].phone;
        $scope.invoice.email = model.enterprise.data[0].email;
        $scope.invoice.name = model.distribution.data[0].name;
        $scope.invoice.date = model.distribution.data[0].date;
      }

    }

    function buildPatientLocation(model) {
      dependencies.location = {
        required: true,
        query: '/location/' + model.recipient.data[0].current_location_id
      };

      validate.process(dependencies, ['location'])
      .then(patientReceipt);
    }

    function processIndirectPurchase (identifiant){
      var dependencies = {};
      dependencies.enterprise = {
        query : {
          tables : {
            'enterprise' : {columns : ['id', 'name', 'phone', 'email', 'location_id' ]},
            'project'    : {columns : ['name', 'abbr']}
          },
          join : ['enterprise.id=project.enterprise_id']
        }
      };

      dependencies.purchase = {
        query : {
          identifier : 'uuid',
          tables : {
            purchase : { columns : ['uuid', 'reference', 'cost', 'creditor_uuid', 'employee_id', 'project_id', 'purchase_date', 'note'] },
            employee : { columns : ['code', 'name'] },
            project : { columns : ['abbr'] }
          },
          join : ['purchase.project_id=project.id', 'purchase.employee_id=employee.id'],
          where : ['purchase.uuid='+identifiant]
        }
      };

      validate.process(dependencies)
      .then(getLocations)
      .then(polish)
      .catch(function (err) {
        console.log('error pendant la genaration de la facture');
      });

      function getLocations (model) {
        dependencies.location = {};
        dependencies.location.query = 'location/' +  model.enterprise.data[0].location_id;
        return validate.process(dependencies, ['location']);
      }

      function polish (model) {
        $scope.invoice = {};
        console.log('polish ', model);
        $scope.invoice.uuid = identifiant;
        $scope.invoice.enterprise_name = model.enterprise.data[0].name;
        $scope.invoice.village = model.location.data[0].village;
        $scope.invoice.sector = model.location.data[0].sector;
        $scope.invoice.phone = model.enterprise.data[0].phone;
        $scope.invoice.email = model.enterprise.data[0].email;
        $scope.invoice.name = model.purchase.data[0].name;
        $scope.invoice.purchase_date = model.purchase.data[0].purchase_date;
        $scope.invoice.reference = model.purchase.data[0].abbr + model.purchase.data[0].reference;
        $scope.invoice.employee_code = model.purchase.data[0].code;
        $scope.invoice.cost = model.purchase.data[0].cost;
      }
    }

    function processGenericIncome (identifiant){
      var dependencies = {};
      dependencies.enterprise = {
        query : {
          tables : {
            'enterprise' : {columns : ['id', 'name', 'phone', 'email', 'location_id' ]},
            'project'    : {columns : ['name', 'abbr']}
          },
          join : ['enterprise.id=project.enterprise_id']
        }
      };

      dependencies.record = {
        query : {
          identifier : 'uuid',
          tables : {
            primary_cash : { columns : ['reference', 'description', 'cost', 'currency_id', 'date'] },
            user : { columns : ['first', 'last'] },
            debitor : { columns : ['text'] }
          },
          join : ['primary_cash.user_id=user.id', 'primary_cash.deb_cred_uuid=debitor.uuid'],
          where : ['primary_cash.uuid='+identifiant]
        }
      };

      validate.process(dependencies)
      .then(getLocations)
      .then(polish)
      .catch(function (err) {
        console.log('error ');
      });

      function getLocations (model) {
        dependencies.location = {};
        dependencies.location.query = 'location/' +  model.enterprise.data[0].location_id;
        return validate.process(dependencies, ['location']);
      }

      function polish (model) {
        $scope.invoice = {};
        console.log('polish ', model);
        $scope.invoice.uuid = identifiant;
        $scope.invoice.enterprise_name = model.enterprise.data[0].name;
        $scope.invoice.village = model.location.data[0].village;
        $scope.invoice.sector = model.location.data[0].sector;
        $scope.invoice.phone = model.enterprise.data[0].phone;
        $scope.invoice.email = model.enterprise.data[0].email;
        $scope.invoice.name = model.record.data[0].text;
        $scope.invoice.date = model.record.data[0].date;
        $scope.invoice.reference = model.enterprise.data[0].abbr + model.record.data[0].reference;
        $scope.invoice.cost = model.record.data[0].cost;
        $scope.invoice.description = model.record.data[0].description;
        $scope.invoice.currency_id = model.record.data[0].currency_id;
        $scope.invoice.by = model.record.data[0].first + '  ' + model.record.data[0].last;
      }
    }

    function processGenericExpense (identifiant){
      var dependencies = {};
      dependencies.enterprise = {
        query : {
          tables : {
            'enterprise' : {columns : ['id', 'name', 'phone', 'email', 'location_id' ]},
            'project'    : {columns : ['name', 'abbr']}
          },
          join : ['enterprise.id=project.enterprise_id']
        }
      };

      dependencies.record = {
        query : {
          identifier : 'uuid',
          tables : {
            primary_cash : { columns : ['reference', 'description', 'cost', 'currency_id', 'date'] },
            user : { columns : ['first', 'last'] },
            creditor : { columns : ['text'] }
          },
          join : ['primary_cash.user_id=user.id', 'primary_cash.deb_cred_uuid=creditor.uuid'],
          where : ['primary_cash.uuid='+identifiant]
        }
      };

      validate.process(dependencies)
      .then(getLocations)
      .then(polish)
      .catch(function (err) {
        console.log('error ');
      });

      function getLocations (model) {
        dependencies.location = {};
        dependencies.location.query = 'location/' +  model.enterprise.data[0].location_id;
        return validate.process(dependencies, ['location']);
      }

      function polish (model) {
        $scope.invoice = {};
        console.log('polish ', model);
        $scope.invoice.uuid = identifiant;
        $scope.invoice.enterprise_name = model.enterprise.data[0].name;
        $scope.invoice.village = model.location.data[0].village;
        $scope.invoice.sector = model.location.data[0].sector;
        $scope.invoice.phone = model.enterprise.data[0].phone;
        $scope.invoice.email = model.enterprise.data[0].email;
        $scope.invoice.name = model.record.data[0].text;
        $scope.invoice.date = model.record.data[0].date;
        $scope.invoice.reference = model.enterprise.data[0].abbr + model.record.data[0].reference;
        $scope.invoice.cost = model.record.data[0].cost;
        $scope.invoice.description = model.record.data[0].description;
        $scope.invoice.currency_id = model.record.data[0].currency_id;
        $scope.invoice.by = model.record.data[0].first + '  ' + model.record.data[0].last;
      }
    }

    function buildConventionInvoice (model) {
      dependencies.location.query = 'location/' + model.convention.data[0].location_id;
      validate.process(dependencies, ['location'])
        .then(conventionInvoice);
    }

    function buildInvoiceQuery(model) {
      var invoiceCondition = dependencies.invoice.query.where = [];
      var invoiceItemCondition = dependencies.invoiceItem.query.where = [];

      model.cash.data.forEach(function(invoiceRef, index) {

        if (index!==0) {
          invoiceCondition.push('OR');
        }

        invoiceCondition.push('sale.uuid=' + invoiceRef.invoice_uuid);
        invoiceItemCondition.push('sale_item.sale_uuid=' + invoiceRef.invoice_uuid);
        if (index !== model.cash.data.length - 1) {
          invoiceItemCondition.push('OR');
        }
      });

      dependencies.invoice.query.where = invoiceCondition;
      dependencies.invoiceItem.query.where = invoiceItemCondition;

      processSale();
    }

    //TODO credit hack
    function buildCreditRecipient(model) {
      dependencies.location = {
        required: true,
        query: '/location/' + model.credit.data[0].current_location_id
      };

      validate.process(dependencies).then(creditInvoice);
    }

    function buildRecipientQuery(model) {
      var invoice_data = model.invoice.data[0];

      dependencies.recipient.query = {
        tables: {
          'patient' : {
            columns: ['first_name', 'last_name', 'dob', 'current_location_id', 'reference', 'registration_date']
          },
          'project' : {
            columns: ['abbr']
          },
          'debitor' : {
            columns: ['text']
          },
          'debitor_group' : {
            columns : ['name', 'is_convention'],
          }
        },
        where: [
          'patient.debitor_uuid=' + invoice_data.debitor_uuid,
        ],
        join : [
          'patient.project_id=project.id',
          'patient.debitor_uuid=debitor.uuid',
          'debitor.group_uuid=debitor_group.uuid'
        ]
      };

      dependencies.ledger.query = 'ledgers/debitor/' + invoice_data.debitor_uuid;
      return validate.process(dependencies, ['recipient'])
      .then(buildLocationQuery);
    }

    function buildLocationQuery(model) {
      var recipient_data = model.recipient.data[0];

      dependencies.location.query = 'location/' + recipient_data.current_location_id;
      return validate.process(dependencies).then(invoice);
    }

    function invoice(model) {
      var routeCurrencyId;
      //Expose data to template
      $scope.model = model;

      $scope.session = {};
      $scope.session.currentCurrency = $scope.model.currency.get($scope.project.currency_id);
      routeCurrencyId = $scope.session.currentCurrency.currency_id;

      //Default sale receipt should only contain one invoice record - kind of a hack for multi-invoice cash payments
      $scope.invoice = $scope.model.invoice.data[$scope.model.invoice.data.length-1];
      $scope.invoice.totalSum = 0;
      $scope.invoice.ledger = $scope.model.ledger.get($scope.invoice.uuid);

      $scope.recipient = $scope.model.recipient.data[0];
      $scope.recipient.location = $scope.model.location.data[0];
      //FIXME huge total hack
      $scope.model.invoice.data.forEach(function(invoiceRef) {
        $scope.invoice.totalSum += invoiceRef.cost;
      });
      // Human readable ID
      $scope.recipient.hr_id = $scope.recipient.abbr.concat($scope.recipient.reference);
      $scope.invoice.hr_id = $scope.invoice.abbr.concat($scope.invoice.reference);


      //FIXME hacks for meeting
      if (model.cash) {
        $scope.cashTransaction  = $scope.model.cash.data[0];
        routeCurrencyId = $scope.cashTransaction.currency_id;
      }

      $scope.updateCost(routeCurrencyId);
    }

    function patientReceipt(model) {
      $scope.model = model;
      $scope.recipient = $scope.model.recipient.data[0];
      $scope.location = $scope.model.location.data[0];

      // Human readable ID
      $scope.recipient.hr_id = $scope.recipient.abbr.concat($scope.recipient.reference);
    }

    //TODO Follows the process credit hack
    function creditInvoice(model) {
      $scope.model = model;
      $scope.note = $scope.model.credit.data[0];
      $scope.location = $scope.model.location.data[0];
    }

    $scope.updateCost = function updateCost(currency_id) {
      $scope.invoice.localeCost = exchange($scope.invoice.cost, currency_id, $scope.invoice.invoice_date);
      if ($scope.invoice.ledger)  {
        $scope.invoice.localeBalance = exchange($scope.invoice.ledger.balance, currency_id, $scope.invoice.invoice_date);
        $scope.invoice.ledger.localeCredit = exchange($scope.invoice.ledger.credit, currency_id, $scope.invoice.invoice_date);
      }

      $scope.invoice.localeTotalSum = exchange($scope.invoice.totalSum, currency_id, $scope.invoice.invoice_date);

      $scope.model.invoiceItem.data.forEach(function (item) {
        item.localeTransaction = exchange(item.transaction_price, currency_id, $scope.invoice.invoice_date);
        item.localeCost = exchange((item.credit - item.debit), currency_id, $scope.invoice.invoice_date);
      });
    };

    function convert (value, currency_id, date) {
      return value / exchange.rate(value, currency_id, date);
    }

    $scope.filterCash = function filterCash(item, invoice) {
      return item.sale_uuid === invoice.invoice_uuid;
    };

    function cautionInvoice (model) {
      $scope.model = model;
      $scope.location = $scope.model.location.data[0];
      $scope.caution = $scope.model.caution.data[0];
    }

    function transfertInvoice (model) {
      $scope.invoice = {};
      $scope.model = model;
      $scope.invoice.enterprise_name = model.enterprise.data[0].name;
      $scope.invoice.village = model.location.data[0].village;
      $scope.invoice.sector = model.location.data[0].sector;
      $scope.invoice.phone = model.enterprise.data[0].phone;
      $scope.invoice.email = model.enterprise.data[0].email;
      $scope.transfert = $scope.model.transfert.data[0];
    }

    function conventionInvoice (model) {
      $scope.model = model;
      $scope.conventions = $scope.model.convention.data;
      $scope.location = $scope.model.location.data[0];
    }

    templates = {
      'cash' : {
        fn  : processCash,
        url : '/partials/receipts/templates/cash.html'
      },
      'caution' : {
        fn  : processCaution,
        url : '/partials/receipts/templates/caution.html'
      },
      'sale' : {
        fn  : processSale,
        url : '/partials/receipts/templates/sale.html'
      },
      'credit' : {
        fn  : processCredit,
        url : '/partials/receipts/templates/credit.html'
      },
      'patient' : {
        fn  : processPatient,
        url : '/partials/receipts/templates/patient.html'
      },
      'purchase' : {
        fn  : processPurchase,
        url : '/partials/receipts/templates/purchase.html'
      },
      'pcash_transfert' : {
        fn  : processTransfer,
        url : '/partials/receipts/templates/transfer.html'
      },
      'pcash_convention' : {
        fn  : processConvention,
        url : '/partials/receipts/templates/convention.html'
      },
      'movement' : {
        fn  : processMovement,
        url : '/partials/receipts/templates/movement.html'
      },
      'consumption' : {
        fn  : processConsumption,
        url : '/partials/receipts/templates/consumption.html'
      },
      'indirect_purchase' : {
        fn  : processIndirectPurchase,
        url : '/partials/receipts/templates/indirect.purchase.html'
      },
      'confirm_purchase' : {
        fn  : processConfirmPurchase,
        url : '/partials/receipts/templates/confirm.purchase.html'
      },
      'service_distribution' : {
        fn  : processServiceDist,
        url : '/partials/receipts/templates/distribution.html'
      },
      'generic_income' : {
        fn  : processGenericIncome,
        url : '/partials/receipts/templates/generic.income.html'
      },
      'generic_expense' : {
        fn              : processGenericExpense,
        url             : '/partials/receipts/templates/generic.income.html'
      }
    };

    appstate.register('project', function (project) {
      $scope.project = project;
      $scope.template = templates[origin];
      templates[origin].fn(invoiceId);
    });

    $scope.convert = convert;
  }
]);