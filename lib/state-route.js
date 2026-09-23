const { validateState } = require('./core');

module.exports = function createStateHandler({ enqueueWrite, getState, setState, persist, nextRevision }) {
  return async (req, res) => {
    const invalid = validateState(req.body);
    if (invalid) return res.status(400).json({ error: invalid });
    try {
      const result = await enqueueWrite(async () => {
        const current = await getState(req);
        if ((req.body.versao || 0) !== (current?.versao || 0)) {
          return { conflict: true, versao: current?.versao || 0 };
        }
        const previous = current;
        const incoming = JSON.parse(JSON.stringify(req.body));
        delete incoming._excluidos;
        incoming.versao = nextRevision();
        const revision = incoming.versao;
        await setState(incoming, req);
        try {
          await persist(req);
        } catch (error) {
          if ((await getState(req)) === incoming && incoming.versao === revision) await setState(previous, req);
          throw error;
        }
        return { success: true, versao: revision };
      });
      res.status(result.conflict ? 409 : 200).json(result);
    } catch (error) {
      console.error('[API /api/estado POST]', error.message);
      res.status(500).json({ error: 'Não foi possível gravar o estado. Preserve o rascunho e tente novamente.' });
    }
  };
};
