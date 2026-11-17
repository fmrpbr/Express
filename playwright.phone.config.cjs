const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/browser-phone',timeout:45000,workers:1,use:{browserName:'chromium',launchOptions:{args:['--no-sandbox']},viewport:{width:393,height:852}},reporter:'list'});
