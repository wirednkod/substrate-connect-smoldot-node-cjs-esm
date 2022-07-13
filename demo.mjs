import * as smoldot from 'smoldotest-light';
import { default as websocket } from 'websocket';
import * as http from 'node:http';
import * as process from 'node:process';
import * as fs from 'node:fs';

const chainSpecsFiles = [
  './specs/westend.json',
  './specs/polkadot.json',
  './specs/kusama.json',
  './specs/rococo.json'
];

const chainSpecsById = {};
let firstChainSpecId = null;
for (const file of chainSpecsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const decoded = JSON.parse(content);
  if (!firstChainSpecId)
      firstChainSpecId = decoded.id;  
  chainSpecsById[decoded.id] = {
      chainSpec: content,
      relayChain: decoded.relay_chain,
  };
}

const client = smoldot.start({
  maxLogLevel: 3, 
  forbidTcp: false,
  forbidWs: false,
  forbidNonLocalWs: false,
  forbidWss: false,
  cpuRateLimit: 0.5,
  logCallback: (_level, target, message) => {
      // As incredible as it seems, there is currently no better way to print the current time
      // formatted in a certain way.
      const now = new Date();
      const hours = ("0" + now.getHours()).slice(-2);
      const minutes = ("0" + now.getMinutes()).slice(-2);
      const seconds = ("0" + now.getSeconds()).slice(-2);
      const milliseconds = ("00" + now.getMilliseconds()).slice(-3);
      console.log(
          "[%s:%s:%s.%s] [%s] %s",
          hours, minutes, seconds, milliseconds, target, message
      );
  }
});

client
  .addChain({ chainSpec: chainSpecsById[firstChainSpecId].chainSpec })
  .catch((error) => {
      console.error("Error while adding chain: " + error);
      process.exit(1);
  });

let server = http.createServer(function (_request, response) {
  response.writeHead(404);
  response.end();
});
server.listen(9944, function () {
  console.log('JSON-RPC server now listening on port 9944');
  console.log('Please visit one of:');
  for (const chainId in chainSpecsById) {
      console.log('- ' + chainId + ': https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A9944%2F' + chainId);
  }
  console.log('');
});
let wsServer = new websocket.server({
  httpServer: server,
  autoAcceptConnections: false,
});

wsServer.on('request', function (request) {
  const chainCfg = chainSpecsById[request.resource.substring(1)];

  if (!chainCfg) {
      request.reject(404);
      return;
  }

  const connection = request.accept(request.requestedProtocols[0], request.origin);
  console.log('(demo) New JSON-RPC client connected: ' + request.remoteAddress + '.');

  // Start loading the chain.
  let chain = (async () => {
      if (chainCfg.relayChain) {
          if (!chainSpecsById[chainCfg.relayChain])
              throw new Error("Couldn't find relay chain: " + chainCfg.relayChain);

          const relay = await client.addChain({
              chainSpec: chainSpecsById[chainCfg.relayChain].chainSpec,
          });

          const para = await client.addChain({
              chainSpec: chainCfg.chainSpec,
              jsonRpcCallback: (resp) => {
                  connection.sendUTF(resp);
              },
              potentialRelayChains: [relay]
          });

          return { relay, para };
      } else {
          return {
              relay: await client.addChain({
                  chainSpec: chainCfg.chainSpec,
                  jsonRpcCallback: (resp) => {
                      connection.sendUTF(resp);
                  },
              })
          };
      }
  })().catch((error) => {
      console.error("(demo) Error while adding chain: " + error);
      connection.close(1011); // Internal server error
  });

  connection.on('message', function (message) {
      if (message.type === 'utf8') {
          chain
              .then(chain => {
                  if (chain.para)
                      chain.para.sendJsonRpc(message.utf8Data);
                  else
                      chain.relay.sendJsonRpc(message.utf8Data);
              })
              .catch((error) => {
                  console.error("(demo) Error during JSON-RPC request: " + error);
                  process.exit(1);
              });
      } else {
          connection.close(1002); // Protocol error
      }
  });

  connection.on('close', function (reasonCode, description) {
      console.log("(demo) JSON-RPC client " + connection.remoteAddress + ' disconnected.');
      chain.then(chain => {
          chain.relay.remove();
          if (chain.para)
              chain.para.remove();
      }).catch(() => { });
  });
});
