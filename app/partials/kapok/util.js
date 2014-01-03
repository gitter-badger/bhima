angular.module('kpk.controllers')
.controller('utilController', function($scope, $translate, messenger) { 
  ////
  // summary: 
  //  Responsible for all utilities (buttons/ selects etc.) on the application side bar
  /////
  'use strict';


  $scope.toggleTranslate = function toggleTranslate(lang_key) { 
    messenger.push({type: 'success', msg: 'clicked translate!'});

    $translate.uses(lang_key);
  };


  //removed select code - downloaded Enterprises/Fiscal Years and populated selects
});
