function Parser(str, separator) {
  this.str = str;
  this._separator = separator || 'whitespace';
}

var disallowed = ['parse', 'mix', 'grab'];
Parser.prototype.grab = function(type) {
  if(this[type] && disallowed.indexOf(type) === -1) return this[type]();
  if(type instanceof RegExp)
    return this.get(type);
  throw new Error('Cannot grab unknown type');
};

Parser.prototype.get = function(re) {
  var parsed = re.exec(this.str);
  if(parsed && parsed.length) {
    if(parsed[1]) {
      this.str = this.str.slice(parsed[1].length);
      // Separator must be grabbed inside here, to prevent
      // infinite recursion
      this.grab(this._separator);
      return parsed[1];
    }
  }
};

Parser.prototype.whitespace = function() {
  return this.get(/(^\s+).*/);
};

Parser.prototype.hex = function() {
  return parseInt(this.get(/(^0x[\da-fA-F]+).*/), 16);
};

Parser.prototype.num = function() {
  return parseInt(this.get(/(^[\d\-]+).*/), 10);
};

Parser.prototype.string = function() {
  return this.get(/(^[^\s]+).*/);
}
Parser.prototype.rest = function() {
  return this.get(/(.*)/);
};

module.exports = Parser;