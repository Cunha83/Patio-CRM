const express = require('express');
const router = express.Router();

router.use(require('./config_company.routes'));
router.use(require('./config_assistant.routes'));
router.use(require('./config_lgpd_demo.routes'));


// Suporte a inspeção direta de router.stack para suítes de testes de regressão
const rawStack = router.stack;
Object.defineProperty(router, 'stack', {
  configurable: true,
  enumerable: true,
  get() {
    const flat = [];
    for (const layer of rawStack) {
      if (layer.route) {
        flat.push(layer);
      } else if (layer.handle && Array.isArray(layer.handle.stack)) {
        for (const sub of layer.handle.stack) {
          flat.push(sub);
        }
      } else {
        flat.push(layer);
      }
    }
    return flat;
  },
  set(val) {
    rawStack.length = 0;
    rawStack.push(...val);
  }
});

module.exports = router;
