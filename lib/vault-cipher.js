var crypto = require('crypto');

var pbkdf2 = function(password, salt, keylen, iterations, callback, context) {
  crypto.pbkdf2(password, salt, iterations, keylen, function(error, key) {
    callback.call(context, error, new Buffer(key, 'binary').toString('hex'));
  });
};

var randomBytes = function(size) {
  if (crypto.randomBytes) return crypto.randomBytes(size);
  var buffer = new Buffer(size);
  while (size--) buffer[size] = Math.floor(Math.random() * 256);
  return buffer;
};

var Cipher = function(key, options) {
  options = options || {};
  
  this._key     = key;
  this._mode    = Cipher.DEFAULT_MODE;
  this._mac     = Cipher.DEFAULT_MAC;
  this._uuid    = options.uuid || Cipher.UUID;
  this._keySize = Cipher.KEY_SIZE;
  this._ivSize  = Cipher.IV_SIZE;
  this._macSize = Cipher.MAC_SIZE;
};

Cipher.DEFAULT_MODE = 'aes-256-cbc';
Cipher.DEFAULT_MAC  = 'sha256';
Cipher.UUID         = '73e69e8a-cb05-4b50-9f42-59d76a511299';
Cipher.KEY_SIZE     = 16;
Cipher.IV_SIZE      = 16;
Cipher.MAC_SIZE     = 64;

Cipher.prototype.deriveKeys = function(callback, context) {
  pbkdf2(this._key, this._uuid, this._keySize, 1, function(error, key1) {
    pbkdf2(this._key, this._uuid, this._keySize, 2, function(error, key2) {
      callback.call(context, key1, key2);
    }, this);
  }, this);
};

Cipher.prototype.encrypt = function(plaintext, callback, context) {
  this.deriveKeys(function(key1, key2) {
    var key = new Buffer(key1, 'utf8'),
        iv  = randomBytes(this._ivSize),
        
        cipher     = crypto.createCipheriv(this._mode, key, iv),
        ciphertext = cipher.update(plaintext, 'utf8', 'base64') + cipher.final('base64');
    
    ciphertext = new Buffer(ciphertext, 'utf8');
    
    var result = new Buffer(iv.length + ciphertext.length);
    iv.copy(result);
    ciphertext.copy(result, iv.length);
    
    var hmac = crypto.createHmac(this._mac, key2);
    hmac.update(result.toString('base64'));

    var mac = new Buffer(hmac.digest('hex'), 'utf8'),
        out = new Buffer(result.length + mac.length);
    
    result.copy(out);
    mac.copy(out, result.length);
    
    callback.call(context, null, out.toString('base64'));
  }, this);
};

Cipher.prototype.decrypt = function(ciphertext, callback, context) {
  this.deriveKeys(function(key1, key2) {
    var key     = new Buffer(key1, 'utf8'),
        buffer  = new Buffer(ciphertext, 'base64'),
        message = buffer.slice(0, Math.max(buffer.length - this._macSize, 0)),
        iv      = message.slice(0, Math.min(this._ivSize, message.length)),
        payload = message.slice(Math.min(this._ivSize, message.length)),
        mac     = buffer.slice(Math.max(buffer.length - this._macSize, 0)),
        cipher, plaintext;
    
    try {
      cipher    = crypto.createDecipheriv(this._mode, key, iv);
      plaintext = cipher.update(payload, 'base64', 'utf8') + cipher.final('utf8');
    } catch (e) {
      plaintext = null;
    }
    
    var hmac = crypto.createHmac(this._mac, key2);
    hmac.update(message.toString('base64'));

    var expected = hmac.digest('hex'),
        actual   = mac.toString('utf8');
    
    pbkdf2(this._uuid, expected, 32, 1, function(error, key1) {
      pbkdf2(this._uuid, actual, 32, 1, function(error, key2) {
        
        if (key1 !== key2)
          callback.call(context, new Error('DecryptError'));
        else if (plaintext === null)
          callback.call(context, new Error('DecryptError'));
        else
          callback.call(context, null, plaintext);
      }, this);
    }, this);
  }, this);
};

module.exports = Cipher;
