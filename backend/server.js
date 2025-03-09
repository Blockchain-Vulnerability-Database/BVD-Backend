const express = require('express');
const { contractConfig } = require('./config');
const routes = require('./routes');
const { requestLogger, errorHandler } = require('./middlewares/logging');

const app = express();
app.use(express.json());
app.use(requestLogger);
app.use('/', routes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

contractConfig.validateNetwork().then(() => {
  app.listen(PORT, () => {
    console.log(`Service operational on port ${PORT}`);
    console.log(`Network: ${process.env.POLYGON_ZKEVM_RPC_URL}`);
    console.log(`Contract: ${process.env.CONTRACT_ADDRESS}`);
  });
});