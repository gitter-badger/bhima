/**
 * Naive test for creating fiscal years, verify successful transaction, this
 * could include tests for creating overlapping years etc.
 */
var credentials = { 
  username : 'sfount',
  password : '1'
}

var testModule = { 
  link : 'Fiscal Year'
}

module.exports = { 
  setUp : function (client) { 
    console.log('[setUp]');
  },

  tearDown : function () { console.log('[tearDown]'); },
  
  'login' : function (client) { 
    //Browse to bhima and log in 
    client.url('http://localhost:8080');

    client.waitForElementVisible('body', 1000);

    //Login 
    client.assert.visible('input[name=username]')
      .setValue('input[name=username]', credentials.username)
      .setValue('input[name=password]', credentials.password);
    
    client.click('input[type=submit]');
    
    client.waitForElementVisible('div[id=kpk-tree]', 1000) 
      .assert.title('BHIMA');

  },

  'navigate' : function (client) { 
    
    //Should check to see if admin branch is already expanded 
    client.click('i[name="Admin"]')
      .click('span[name="' + testModule.link + '"]')
      .pause(1000)
      .verify.containsText('header', 'Fiscal Year Management');

    client.click('button[id=createFiscal]')
      .pause(300);

    client.verify.visible('div[id=createPanel]')
      .setValue('input[id=fiscalNote]', 'Tshikaji 2014')
      .setValue('input[id=startMonth]', '2014-01');

    client.verify.visible('button[id=submitFiscal]')
      .click('button[id=submitFiscal]')
      .waitForElementVisible('button[id="resetBalance"]', 4000)
      .click('button[id="resetBalance"]');

    client.verify.visible('button[id="submitBalance"]')
      .click('button[id="submitBalance"]');

    client.waitForElementVisible('[id=message]', 3000)
      .verify.cssClassPresent('[id=message]', 'alert-success');
  }, 

  'logout' : function (client) { 
    client.click('a[name=logout]')
      .pause(1000)
      .assert.title('Login to BHIMA')
      .end();
  }
};