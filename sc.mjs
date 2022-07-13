import { createScClient, WellKnownChain } from 'connectest';

const scClient = createScClient();

const  westendChain = await scClient.addWellKnownChain(
  WellKnownChain.westend2,
  function jsonRpcCallback(response) {
    console.log(response)
  }
);
westendChain.sendJsonRpc(
  '{"jsonrpc":"2.0","id":"1","method":"chainHead_unstable_follow","params":[true]}',
);