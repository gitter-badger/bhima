var path                    = require('path');
var fs                      = require('fs');
var q                       = require('q');

// Import and compile template files
var dots                    = require('dot').process({path : path.join(__dirname, 'templates')});

var wkhtmltopdf             = require('wkhtmltopdf');
var uuid                    = require('./../../lib/guid');
var config                  = require('./config');

// Document contexts
var invoiceContext          = require('./data/invoice');
var balanceContext          = require('./data/balance_sheet');
var bilanContext            = require('./data/bilan');
var grandLivreContext       = require('./data/grand_livre');
var EmployeeStateContext    = require('./data/employee_state');

// Module configuration
var writePath = path.join(__dirname, 'out/');

// Map templates and context compilation to request targets
var documentHandler = {
  invoice : {
    template : dots.invoice,
    context : invoiceContext
  },
  balance : {
    template : dots.balance_sheet,
    context : balanceContext
  },
  bilan : {
    template : dots.bilan,
    context : bilanContext
  },
  grand_livre : {
    template : dots.grand_livre,
    context : grandLivreContext
  },
  employee_state : {
    template : dots.employee_state, //templating provider
    context : EmployeeStateContext // data provider
  }
};

// Perform initial settup
initialise();

exports.serve = function (req, res, next) {
  var target = req.params.target;
  var options = {root : writePath};

  res.sendFile(target.concat('.pdf'), options, function (err, res) {
    if (err) {
      res.status(err.status).end();
    } else {

      // Delete (unlink) served file
      /*fs.unlink(path.join(__dirname, 'out/').concat(target, '.pdf'), function (err) {
        if (err) throw err;
      });*/
    }
  });
};

exports.build = function (req, res, next) {
  var target = req.params.route; //contains the kind of report to build e.g : bilan, grand livre etc ...
  var renderTarget = renderPDF; //renderPDF is a function which handle the pdf generation process

  var handler = documentHandler[target]; //handler will contain a object with two property, template for structure and context for data
  var options = req.body;

  // Module does not support the requested document
  if (!handler) {
    res.status(500).end('Invalid or Unknown document target');
  } else {

    handler.context.compile(options)
    .then(renderTarget)
    .catch(next);
  }

  function renderPDF(reportData) {
    var compiledReport;
    var hash = uuid();

    var format = options.format || 'standard';
    var language = options.language || 'en';
    var configuration = buildConfiguration(hash, format);

    // Ensure templates have path data
    reportData.path = reportData.path || __dirname;
    compiledReport = handler.template(reportData);



    // wkhtmltopdf exceptions not handled
    var pdf = wkhtmltopdf(compiledReport, configuration, function (code, signal, a) {
      // Return path to file service
      res.send('/report/serve/' + hash);
    });
  }
};

// Return configuration object for wkhtmltopdf process
function buildConfiguration(hash, size) {
  var context = config[size] || config.standard;
  var hash = hash || uuid();

  context.output = writePath.concat(hash, '.pdf');
  return context;
}

function initialise() {

  // Ensure write folder exists - wkhtmltopdf will silently fail without this
  fs.exists(writePath, function (exists) {

    if (!exists) {
      fs.mkdir(writePath, function (err) {
        if (err) throw err;

        console.log('[controllers/report] output folder written :', writePath);
      });
    }
  });
}
