import di from './di';

di.resolve(['config', 'server'])
    .then(({ config, server }) => {
        server.listen(config.http.port, () => {
            console.log(`Listening on port ${config.http.port}.`);
        });
    });
