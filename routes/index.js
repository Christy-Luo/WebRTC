var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/screen', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/webrtc', function(req, res, next) {
  res.render('webrtc', { title: 'Express' });
});

router.get('/demo', function(req, res, next) {
  res.render('demo', { title: 'Express' });
});

router.get('/', function(req, res, next) {
  res.render('conference', { title: 'Express' });
});

module.exports = router;
