const sc = require('connectest');

const { createScClient, WellKnownChain } = sc;

const scClient = createScClient();

scClient.addWellKnownChain(
  WellKnownChain.westend2,
  function jsonRpcCallback(response) {
    console.log(response)
  }
).then(westendChain => { 
  westendChain.sendJsonRpc(
    '{"jsonrpc":"2.0","id":"1","method":"chainHead_unstable_follow","params":[true]}',
  )
});