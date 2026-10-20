# Manifesto Oficial de Release do Piloto Controlado

**Projeto:** Pátio CRM  
**Versão:** `1.0.0`  
**Fase:** Piloto Controlado em Ambiente Operacional (1 Oficina)  
**Data de Congelamento:** 2026-10-20T00:03:45.602Z  
**Commit Git:** `2bf72bb2766f4d2d58f86faa90343e9aad918a71` (`branch: main`)  
**Ambiente:** Node.js `v24.21.0` em `win32-x64`  
**Total de Arquivos Auditados:** 172  

---

## 1. Política de Isolamento e Zero Segredos
Nenhum dado real, banco de dados de produção (`patio.db`), arquivo de backup, anexo de upload ou segredo de configuração (`.env`, certificados digitais SEFAZ A1, chaves privadas) está presente ou rastreado nesta release.

- **Exclusões Rastreáveis:**
  - `.env` e variantes
  - `patio.db`, `patio.db-wal`, `patio.db-shm`
  - Diretórios `backups/`, `uploads/`, `public/uploads/`, `scratch/`, `locks/`
  - Sessões de WhatsApp (`.wwebjs_auth/`, `.wwebjs_cache/`)

> **Nota Técnica de Escopo:** O manifesto com hashes SHA-256 é um inventário estrito de integridade de release e controle de mudanças para implantação; não constitui assinatura digital por autoridade certificadora (PKI) nem garante a ausência de segredos injetados em tempo de execução.

---

## 2. Hashes Criptográficos das Camadas Críticas (SHA-256)

| Arquivo Canônico | Hash SHA-256 |
|---|---|
| `server.js` | `ef93609dee47bdd39fb0ab3aac96368b8cf335b8374b396f4d4fab6c02cd208b` |
| `db.js` | `9ed9a2aa49a78b54357683668bec399d8f92c16e34d98fd853277e20c7d9c652` |
| `lib/tokens/securityToken.js` | `84ba877e14395e86d09df98c4edc7f27d7ebc20c4f9ac2b6b46950bac17d0f93` |
| `lib/repository/stateRepository.js` | `57b8e188e6f691c090cc0587c78d4e182aba012b147704dd6f24a412b14cddf4` |
| `services/voiceActionEngine.js` | `963bc5843cc26320598e5f96c36f70bbb29ac4433035ebfccaf34d27bdbaff8c` |
| `services/backupService.js` | `8ce2f7725dfc49e830148980b20fcd23b7efa7257ad945777c8e94766bb40031` |
| `package.json` | `98f4de261b287afb17a53293b7b5a3986e51c6c44d014ac17f67885a35e15b65` |
| `package-lock.json` | `19ee349d862bdddc4a4aa8502a4ab86932627eef5420fedceb9c3eecfe41a96d` |

---

## 3. Inventário Completo de Arquivos da Release (172 Arquivos)

| Caminho Relativo | Checksum SHA-256 |
|---|---|
| `db.js` | `9ed9a2aa49a78b54357683668bec399d8f92c16e34d98fd853277e20c7d9c652` |
| `index.html` | `820509d9eda07219d024d2155db4550a3f1e7d57bd78ddd08fb2ae8f685751d7` |
| `js/.eslintrc.json` | `604bfe77a0c2432063f4929731b69261f99e56755669521834ba150ac613edf8` |
| `js/app.js` | `b95a8135a1ff1627ed9ca169f8db5d61e454d063eabb71c869502d0134938e25` |
| `js/cadastros.js` | `1af2111643feca5171bcc488e9c01e200cf5089199682ef6668f7b9cae4f2ae1` |
| `js/dashboard_operacional.js` | `b2f67accde1b9176ed59721380de9b4b67f0f468c1f60c03c9aba71622c993a1` |
| `js/estoque.js` | `c4a49203354c4f32339134247ccf40a65aea90fae6a948b4bc4cbca86ce32942` |
| `js/financeiro.js` | `4ae89b2e89540f74758dea6b87014b68099198dea4319c2ec111f692bbda85f7` |
| `js/fiscal.js` | `50a75f83f18b507f2164ab05b9e10247539ea20736b321f54c312983f3db2987` |
| `js/icons.js` | `009b9a04aa4040688f59f745fa02752a0e6a3183b81206da8da12258059b00c0` |
| `js/modules/agent_config.js` | `292f5b76dc4f457bab8f62674fb8d7862a6fda005d41d5754f52b51c1908fe36` |
| `js/modules/cadastros_fiscal.js` | `71353d2e08cfa0c32e73e2bfa8a134321b138d1bcc760cbf8cc6b59cf7fd7460` |
| `js/modules/cadastros_forms.js` | `086fc5ea2eaeece08e80fb3ec5afc498c35c91f2a72ad93d28ad204462e310e1` |
| `js/modules/consulta_cliente.js` | `7ece858b03b9c9beba957e34cffdca741f43d42cdfcf557dd641bec01a72b046` |
| `js/modules/dashboard_metrics.js` | `73a3a818cbe09d3643e9703c749d903eb19ff29c078d63649741c8ddfa830a94` |
| `js/modules/events.js` | `3b93a14e2e1f65da9d65c369193068a1dc8a74b296b3ddf669cebb473dd0125a` |
| `js/modules/financeiro_analista.js` | `e821aa972f2daf2b2739271bf0f6b626819f8b1d6cb1a70bcb8e51f68c680eda` |
| `js/modules/integrations.js` | `772d00897136a9ff96bf16202c90bde33e16951388cf2c77795f209b1678cbcb` |
| `js/modules/navigation.js` | `ad67b448a14525e2d4a3e257469f6b384ccb05aba5cea98d7fd13f5d895c7c7d` |
| `js/modules/patio_render.js` | `4dac87732d3c3c9f3716a75423e6dc8ed0108131af74e789ee0e1c95f1e54e8e` |
| `js/patio.js` | `345bdc70b6d6ee4483119267c1848bd521cb6481be684eb4e802de5fc45d1ba2` |
| `js/relatorios.js` | `030ca55304494adf9abcb961f24ee153993656c3f22c84ea51d347c410904614` |
| `js/state.js` | `6edb2ab58c71a930140aa3f178ab3ef22752288be3a31524dc6a057a1d7b1857` |
| `js/support-widget.js` | `b826a26fc0ae5a2b2b40647b59d790694e4b35c5486783f71882306abb0617e1` |
| `js/sync.js` | `113f0515330b64178d9e9f8774f95970e68690b96fc4340ed600d901cef3ec40` |
| `js/voz.js` | `40c8723c5ea0b473349b34f44920ecf676f9a015578e6d1948edcb002325cfae` |
| `js/whatsapp.js` | `c75dd76fff75d38b67f33a027ac89ace0da324675bbf6368c870eff48115fe37` |
| `lib/auth/context.js` | `0cfc750278b615be471bf99da6a5fcb22fd4a4a4f2c3d69c83c033d2e009710c` |
| `lib/auth/identity.js` | `202b9268e5ae15a5e7ac583497c053d48422092ed81d9290b8b8fedffe1e8828` |
| `lib/auth/userRepository.js` | `5867cba59944ac74b5e59b6e932ff6360734a210624a3287815f5e64400db55a` |
| `lib/core.js` | `e629b2fee33b8278e6cdfe8d8f16c87650b5f942803c96360f70a3eaa322eb34` |
| `lib/file-storage.js` | `4b29b7ccd7628ff0b787d9192142d4ebd5c947251ff5adf1803e779d07170a1e` |
| `lib/image-cache.js` | `41e2f61fe97dfd269fa412b98d79e07d311afb1ada369a6982af8bd416c4dfcf` |
| `lib/metrics.js` | `fdb51b8677ddaa4b4b2ab1f39fdd90f786b1d3ff3604fd65e4309430109f9a9d` |
| `lib/outbox/scheduler.js` | `4609855e5f4b8612a17d7a9276bdb83ff1f1a084b59272f1abcf6a28160e7333` |
| `lib/repository/migration.js` | `9fdea76f414ee9c08b14b66efc85e2cd599dde10b161ae15148d3b727bfaf999` |
| `lib/repository/stateRepository.js` | `57b8e188e6f691c090cc0587c78d4e182aba012b147704dd6f24a412b14cddf4` |
| `lib/security/logSanitizer.js` | `ab4b30fe514daf11794ae702542fa5c86c92eed2b4b6b4eeb44422b1e7e0048b` |
| `lib/security/testPaths.js` | `cf816b20d5fd71b055c75479b777db429fc8af5e0ed53cfeb4527597dff95e45` |
| `lib/serverContext.js` | `066745f4648bef3f98a051792c907798779170d5c63e40dba563eb22ce816642` |
| `lib/state-route.js` | `21a993009643dced5583850518c0d7ac5cc075a985b99624e568d88fd1c043c6` |
| `lib/tokens/securityToken.js` | `84ba877e14395e86d09df98c4edc7f27d7ebc20c4f9ac2b6b46950bac17d0f93` |
| `package-lock.json` | `19ee349d862bdddc4a4aa8502a4ab86932627eef5420fedceb9c3eecfe41a96d` |
| `package.json` | `98f4de261b287afb17a53293b7b5a3986e51c6c44d014ac17f67885a35e15b65` |
| `public/aprovacao.html` | `e6913313c55f2721188bca08e896abf752079537f6e7d3f17342b3d8294643c6` |
| `public/assinatura.html` | `4ecf84c95ab4a09ce86e51230dc4dda29a09d7f9112375cf4a64e16ebf8457d6` |
| `public/cadastro.html` | `66ef0a3ffbbfd065a5892f0116b7dd185421dde7f130f06e19b1f4599a843bf5` |
| `public/checkout.html` | `ba975cb20a48dde68a1dd2e83c78f6d626f9b09eb2a64a2827afb2a13ffb4495` |
| `public/precos.html` | `1dd34d66436373c8d05f7c9585eff07d484055ec21914b61f86e1f5fc083eee3` |
| `public/privacidade.html` | `f9fbaa5344507e1f277d4c7bbd7bba9e42c9aa2caa62b3b6a74d36a1724ce8a3` |
| `public/support/inbox.html` | `57d58a4cb3909e49fe66f80dca16610fda09bacce2c5c6f0d9c8196f68f373aa` |
| `public/support/inbox.js` | `5cd5aa690b37ffe933356e16a0379427de957014c113a844792ad15a5d3bee8a` |
| `public/support/support.css` | `72e8b77e691b894949431806b0eb10258a0704591ca94f56b8cf16ceb8ebceab` |
| `public/termos.html` | `8dc24746cd72514f49bbf9d4d3704c9244cd335d392e2324dedd5b7b6e6523b4` |
| `routes/auth.routes.js` | `430eaf09c162744093c5d79748ddee5709242f0d2f651309c2e320a7e8e187da` |
| `routes/backup.routes.js` | `77d8a31d94b3450d8305ec467512138e6ab897a00ec73d10473ae9ff5636b58d` |
| `routes/billing.routes.js` | `6c2c09619db18cc2a22af40f33ea308759d16ba47f07fc5d79dfa0050a9fc803` |
| `routes/config.routes.js` | `e6766a281cb40fd78b85ce720acdad97045d6b202be608aaaae604b92d7892aa` |
| `routes/crm.routes.js` | `0b57e1929f60c6961f36974877afcf55e0c474bdd9fff260283f4528ffb1ae42` |
| `routes/financial.routes.js` | `98891fd97a8f07ed619e4ec033ab31cc620902785f851edfae490905d4dc59b0` |
| `routes/health.routes.js` | `881c1872d327b396e5f8785f1994bb087b6754332735b7835ce098dce21978a1` |
| `routes/index.js` | `ceeb33e8bfc0bdc3f7015090b9f091ec5125f9ce27160ac93832dad9b798ddc2` |
| `routes/inspection.routes.js` | `ca11f6322239c865c403603981e20bc832ca238a8ae344fac51635afdc96d72b` |
| `routes/inventory.routes.js` | `f5943dea99fa5cfb36f9f5c819f708cc0ac1b9ac3cb58ae5a8dd999d373b51a7` |
| `routes/operation.routes.js` | `7104cf25596b49884be9ba46a3199b32445ad0be9332d4866a2bab41dc95c9e1` |
| `routes/os.routes.js` | `af5b213aa4f7f68ab6f1e25afe5723bdecb33f8a2c8e15b06cbcbd374e3200ff` |
| `routes/platform.routes.js` | `c0d2c0a35f91fb269c4727cd303dad0f83c43d2ab6330070dd50353f23feb910` |
| `routes/preOs.routes.js` | `958abac710795f71339bb74bb8f392dc8eb37f34613f7ebba24f32a1359b858e` |
| `routes/pricing.routes.js` | `2d1d84d394a2408af24b80df91f10aa2427b888e917e4b8ea58bf673cce5ae83` |
| `routes/quotation.routes.js` | `ec69fb073d7fe0899d82cdc317caf76f44e61698dc9fa6040cc0b4e6134fd0ec` |
| `routes/state.routes.js` | `d570985b03808c147084151f19655bcb1d3d9483b4992a35f7b861146e2b4f65` |
| `routes/static.routes.js` | `3afda329580645f9ecc20f0da6ce5543dc18f716d83bef32235bb4da3d5d745b` |
| `routes/team.routes.js` | `931fa9d7a283857006bc75b8db4bbbfb8dcee8b0e032006dfbd63c76e088d2ff` |
| `routes/voice.routes.js` | `e443f6cb150e6562c3400dc136547979aa5a7f93ab163ab11e03932f716d72cf` |
| `routes/whatsapp.routes.js` | `90bd588234ac2febf36be7540c97c9540c4f36177ffde0708b39d6814b59ec36` |
| `scripts/auditar_execucao_tarefa_agendada.cjs` | `47a5d3e281bfcdb4737c23f159baab0dad00520d69feb82a3a6c482f27c46d69` |
| `scripts/build_windows_pilot.cjs` | `ace15201cd79925808194e4876ec2bb67bf1f4c968f32b8a525249aea15182de` |
| `scripts/comprovar_restauracao_remota_host.cjs` | `23e0abf8271406e22fa0c3f65edad977a3ebdf7fcf2057ea1474d4fe3e775fb5` |
| `scripts/ensaio_operacional_host.cjs` | `e240261ba669656330634b57d41ff80f94014e4f3d1ccb7f77426712cf5d2516` |
| `scripts/executar_backup_operacional.cjs` | `4e8dfe26963e69618d860bc46c99ff1171aa7ea394c62ed2e239cfd17cb9e46a` |
| `scripts/executar_implantacao_real_piloto.cjs` | `6e160a5b1e3536609f0e75a4a6cede8ab7a9f344c1dd6ac213c7501dafd2c725` |
| `scripts/gerar_manifesto_release.cjs` | `089c43225cad816a93d3dd491df48520066424b33fd0eb4b9c31c916701dd5c5` |
| `scripts/gerar_tarefa_agendada_windows.cjs` | `bcfb7954532e84953fe6b81d909f4eef567be77845e66102817481ae14e28407` |
| `scripts/homologar_frontend_agent_browser.cjs` | `2bd6bc393e59cddcd955d539f86983ab568eb7681b280994d8d0654198683d6d` |
| `scripts/iniciar_piloto.bat` | `90224ca233e40299bf075dae3387af03d0d918b2e1b430664a15cebc4bbb6b66` |
| `scripts/instalar_pacote_piloto.cjs` | `237e06e5fbd3d5975b5c0f39f8fd21d3a35a7532cbce3f38636052eaeed2c93c` |
| `scripts/pilot_http_benchmark.cjs` | `9f0b762066fa9da0125d5bea2269972bd358606aafc790ff18bbfe978a9e3375` |
| `scripts/pilot_load_benchmark.cjs` | `e22f00e52ad5a17bd6ad07337f9d41311b919426a6c60e1bc85dc8f2e7dbb83b` |
| `scripts/preview-fiscal.cjs` | `f09abd79c0eb8df579f9e6a7fc832f58f0bc89997aefa44cb21a937cc0a1ef95` |
| `scripts/preview-jev.cjs` | `83a11cfe01da42831d0bf713f364c95fc1a44af61096ce85ccb77ba3bea46365` |
| `scripts/preview-support.cjs` | `169ef7f2dcfc7f26f8cd07edd7c2693ab7f0308b6c6494f19ecfb1a3406792fe` |
| `scripts/provision-admin.js` | `aac51bf72978b085408362cff531bc849601c83090b9a6351650116c1a6cbb8e` |
| `scripts/provisionar_credenciais_finais.cjs` | `5234daa8141df4737d6b9f6d04e5f5d88995c894139ad04c135b46d415cb1956` |
| `scripts/record_final_suite.cjs` | `0f2afa7ac971f20b8adeb99ccd65e346298184582d2c6549489f566cf4f79c9d` |
| `scripts/run_agent_browser_e2e.cjs` | `066c6c261c061b06a57e91576d09078c2242673a90cc9da6fa7c648194119e44` |
| `scripts/run_agent_browser_e2e.ps1` | `67aef7132395de096a30aad27322d7866e65648be9c381a62ed6856514066764` |
| `scripts/run_agent_browser_verified.cjs` | `23d6c01a05c7e1357ecd789e8b196d56bf6919a8cef677fce7210e2510f1bfa4` |
| `scripts/seedDemoDataset.js` | `ca2918c17898f3b0213001502e87415519fd99f26c6f1e3fe9438d289eec2025` |
| `scripts/servico_backup_remoto.cjs` | `046f594000adc8cedb86aef7a80a268933aa1adb148a3b8b618e19ac62eef7ec` |
| `scripts/sincronizar_release_nao_destrutiva.cjs` | `f82435ea399305363055b4001f158e0bf6ec0fa3eb095329e2033b4693d07930` |
| `scripts/supervise_patio.cjs` | `042c8ff3e968554e422f9ca9b758634ded6d023f8fdb6cf56815e8aa4ff0b029` |
| `scripts/test-preload.cjs` | `2638b4404c4013bca1b01d579de47cac200c450baaeba79e2b30d38e1b14a473` |
| `scripts/testar_restauracao_isolada.cjs` | `7cf45d9dd9ae7d0e7bb1693a706d29fe8171595f532603a9fa3a7c902b270128` |
| `scripts/testar_restauracao_operacional_e2e.cjs` | `53cc914ec16e21e3056976a4be7e9e4411154de2a5675bcf797ee4d4959a2b5c` |
| `scripts/verify_e2e_journey.js` | `545d3d49def890d0ccb5acb4728bf87b5e50ed02d80074cf287290322739441c` |
| `server.js` | `ef93609dee47bdd39fb0ab3aac96368b8cf335b8374b396f4d4fab6c02cd208b` |
| `services/afterSalesService.js` | `6f714f5307ccb1bd44d7d29121a4372af2670130726b7165cebcae42c0632d60` |
| `services/appointmentService.js` | `9e2217c281b96489ad08488686516f2dd0e059f51269a0834fdf9337d303ae44` |
| `services/backupService.js` | `8ce2f7725dfc49e830148980b20fcd23b7efa7257ad945777c8e94766bb40031` |
| `services/billing/billingConfig.js` | `9a18c020b18255b5588f41e12209bcdadc00f65933e6f63f4d4559ad7a04d8a6` |
| `services/billing/billingService.js` | `e4aaefc0980c347349cff4be1f0c545ad6ee106e1b5ac300cf31c21367b511e5` |
| `services/billing/paymentProviderAdapter.js` | `73aba84cecbaacaa30bee3f03fa07decaa08838779db276a62b9f51228831a7e` |
| `services/billing/platformAdminService.js` | `adaa732a1872a30cf207f3ed8a412edac73341bffe0d81052d01d18c9dad7cad` |
| `services/billing/saasTelemetryService.js` | `4c77f3914a902e9fd6451fe7535f2b50618c32bf8f06a36971b2cd78f120e2ef` |
| `services/consultaClienteService.js` | `8385cd7d5151c09e82ba230f3b9496e53778b74cea5fc682a3fce6e80b2ed9dc` |
| `services/costingService.js` | `0c5f92d79340b25d53f236f1072544eb33816d501f0c90689fd7ede43fbc113e` |
| `services/customerTimelineService.js` | `e9a01b448a583e8c5b0bf716ad5e790eea5e28f8250efb94997ceaaa53f2df1c` |
| `services/demoDataService.js` | `33ed44c377f6dd14ee9e9d414419ae4232880084bd2f77df828754cf2ba7dd01` |
| `services/erpIntegrationService.js` | `3c76f606c7af5831e0a413acd7e7fa5caba373d36e032c13f91c0ee629018ba4` |
| `services/executiveManagerService.js` | `8b32de93f464a049d6bba458f31c4af999de75f2090aec4cf83605724cf77e8c` |
| `services/financialAnalystService.js` | `5babe658400ea7913692d156bfdada5b24f9912182f506f92e338eec4ab7df3c` |
| `services/financialEngine.js` | `3ab60554bcfc333c5a006400e31728835a3c14fcb2eadadcdb65ac41c4f30d52` |
| `services/fiscal/decimal.js` | `5c060f6cb2308e6da4d0e4e747d52012cdaaa1964b46b02e5354b2169ff4a7f1` |
| `services/fiscal/fiscalCalculationEngine.js` | `d6f2c2d7d0c694774f340e0aa6547dfad50473a9caaf2e1bd0a7f224d58cfe41` |
| `services/fiscal/fiscalConfigService.js` | `0462c6eba5bc971fd77af0aaca20ce65c383c5283f07f513b2e505f81adcf7dc` |
| `services/fiscal/fiscalEventService.js` | `015ee4a544c4f6df05a0f6a1a55c074977f40d93b6ebec49245b9acad414f167` |
| `services/fiscal/fiscalLifecycleService.js` | `22b412d88aae9b6165c7eace819b02d54ad9ac29cadf5c81c46a57f0670aae13` |
| `services/fiscal/fiscalNumberingService.js` | `1b2e1cefc062cf1575290cfae23b8d14767b734b756650dce2de552acdaa3377` |
| `services/fiscal/fiscalProviderAdapter.js` | `c2edffab5707093d94a15517ce6f10ad5f34300f31b17c6a0a230cb7dae1fc98` |
| `services/fiscal/review.js` | `b2f87d22c3034379bee9148b7c57b01293e2c2bb15db2c14f935d4c6da9cb9c3` |
| `services/fiscal/router.js` | `7db71f7c4b4c645a8a8e429a5e755c1137ec7fba2c48a6bff9a53583dbd2731d` |
| `services/fiscal/transmission.js` | `bf36395390cf86f8da810b8cd95d85997287acf0d8b6085e1681ac1a1f19ebae` |
| `services/incidentResponseService.js` | `8dea568d824e51bcc045fde9521cd0d99fbe0d5c582b0bfaca3dffeed2bbdf7b` |
| `services/inspectionService.js` | `b314036f50cc92c226e73a140cfdee3df056fe9b0046c57ff1c9cee28cc34b1f` |
| `services/intakeQuestionEngine.js` | `3aa29130f842828ee504d4a98fa3c8fd3f8bead0a1c28425a4f117198afd09d5` |
| `services/inventoryService.js` | `3c5712d87f2cfe545e4d69df0cfd5a844c252bbe683894aa7a605c441d7c6dd3` |
| `services/laborTrackingService.js` | `dada7a7f46dc043b808b1883ac4daca096d4f5168bb9873d545fff6bab6096b7` |
| `services/lgpdService.js` | `d553ae95cab002bc90fadb30e12e241aacfcdd9e9f2a0589c868a59670586055` |
| `services/maintenanceContextService.js` | `8ca885534335617a7acfdb7f596b3a2ee21435222fa98e72a884016b905e86be` |
| `services/maintenancePlanService.js` | `301e39848fc4e449ad7810f62c3ca3b3fabdd29d4cbf3507a9f13fba52aa2bab` |
| `services/operationalIntelligenceEngine.js` | `b24d9d754ec9e8f137ab68872097693a971473c895d0cfaa16b805786d22aa28` |
| `services/operationalNotificationPolicy.js` | `325c8ffb1b292046fff231cbe6b337126fcc7a27232de6cd0a802ffec6db7d9c` |
| `services/operationalSummaryService.js` | `f6e54186349108a8c006e5da04a0f658cc12fd2c0d6c29184b5591094322e79c` |
| `services/preOSEngine.js` | `822136da5e66bae52633f30c3954ac69130c8fe61a8da12f0b02137c5a5c8bca` |
| `services/pricingEngine.js` | `776ea777ed22eeed9b6b23593d57ee1626eda53a68edefde4841c7bd0c2fcd07` |
| `services/proactiveAlertsService.js` | `ab9141ee84742a6500f988c043e9069e8abaa9fd89156f1e3b9fba495858921b` |
| `services/procurementService.js` | `f9d1539aaec9e6f88c1eea32d893b2d0587a589f95cd32930e741a1c2b352af4` |
| `services/productivityService.js` | `45f6e115fd99786a27403211b40a9f83177944895187feac3cad39fdf463ab21` |
| `services/quotationService.js` | `2065e6288fe0f7dbdd9358a141d31345e03eaa5e7134fc0d0d70cb02d8afb024` |
| `services/recurrenceDetector.js` | `95a254366e48a8c836c0073617d11d5391bd9f86fe55d5e1eabb1c89e693df79` |
| `services/relationshipService.js` | `44ffdaf30bfe37203c133ffc88c52b1b22e9b90e580ff53034a94e8a1b6d3802` |
| `services/reportGenerationService.js` | `2f43038669a2a9631f19720a2f247752064e900d1b0bd554d42658d81e061369` |
| `services/subscriptionService.js` | `77d4b1c183b39fa912aca685c472a64292b813d73fc904bd9b632a959fcf2ad1` |
| `services/supplierService.js` | `74d5a2302e3b5120e447a4001291739b81b0a27e48ead149fa05bb7641517b35` |
| `services/support/agent.js` | `22d747b95bb410295d62d51bad3eae21e718827c95110c96dc090edc2aba0975` |
| `services/support/index.js` | `43af30eebbefbba828da874ac3a46941c3beb216e01a5451a898a3976def7028` |
| `services/support/knowledge.js` | `90bacca9f24e85bc5c57d18b2406f1cf154f6ad74d64097caeca575696a37609` |
| `services/support/privacy.js` | `6289c45260b2b9b64c07652b10437ba4fcd49e38f7c154befbf61537ecbd793d` |
| `services/support/repository.js` | `a0705e55ea09468590ada36f041f57254a50ce6254e0c8ef3a323ddb46d8602a` |
| `services/support/router.js` | `2ecade228b6f695413888419a552683653ffc295c0a5a08d9c34b82e471c3641` |
| `services/technicalIntakeEngine.js` | `d7d73468f7cb65a09a3c58129f4aee18746a6fbded9f1bc55735b0e03adfedff` |
| `services/vehicleEntryService.js` | `acd886f59d60e091cf573717589a4d57bb570f64fd713168427ade3dc19dc74d` |
| `services/vehicleHistoryService.js` | `49a876ad65137f79cef018614391b3e161c458a2130f7030a2c63411df7aa17a` |
| `services/vehicleLookupService.js` | `10263299acb6d97f88e86edf8f2a36a0e01b462f081d3a17e98f8ad9b32764ef` |
| `services/vehicleReconciliation.js` | `f7d77772caa7dc999b1d3250257096f3107ae2fa0260ade093bcc6b1eb296aba` |
| `services/voiceActionEngine.js` | `963bc5843cc26320598e5f96c36f70bbb29ac4433035ebfccaf34d27bdbaff8c` |
| `services/warrantyService.js` | `e2772f7e3d8987ebba0d4e6a97e2dfad10f3210e490616902629c68d68ebb14b` |
| `services/whatsapp/whatsappClient.js` | `42a50ddf76c999477b7ce373bfc5bfec5511b4ae2929ca4ce0c8a047bec88654` |
| `services/whatsapp/whatsappHandlers.js` | `49178e466adaf63753af884701e27c6d62f7f034c173629b30dd6ea88f5b9848` |
| `services/whatsapp/whatsappScheduler.js` | `01a1ba654ab5f872d14a1ff5957083d496d979b7c0a1b5601dde2b3289e7d3a8` |
| `services/whatsapp/whatsappState.js` | `06aad441cc77f1e5adc508fea0b1a17f0ff59cbbc4862fb0ce3ac761a51e936b` |
| `style.css` | `ea8a3021eebbd6b45d3d56dd88958139734a39599dd9c2300be46714ec0d8297` |

---
*Manifesto gerado automaticamente por `scripts/gerar_manifesto_release.cjs`.*
