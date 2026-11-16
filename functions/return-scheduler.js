'use strict';
const {settleReturns}=require('./domain');
function releaseDueReturns(db,now=Date.now()){
 // A first callback without local data must reach the server before deciding
 // that there are no priorities to release. This never replaces existing data.
 return db.ref().transaction(state=>state===null?{}:settleReturns(state,now)||undefined,undefined,false);
}
module.exports={releaseDueReturns};
