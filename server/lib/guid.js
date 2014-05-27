// Generate guids in javascript
// src: http://byronsalau.com/blog/how-to-create-a-guid-uuid-in-javascript/


module.exports = function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
    v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};