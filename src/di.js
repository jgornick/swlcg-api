import path from 'path';

import _ from 'lodash';
import config from 'config';
import di from 'fount';
import express from 'express';
import expressBodyParser from 'body-parser';
import expressCors from 'cors';
import glob from 'glob';
import keys from 'when/keys';
import knex from 'knex';
import pipeline from 'when/pipeline';
import when from 'when';
import winston from 'winston';
import {Error} from 'common-errors';

di.register('config', config);

di.register(
    'logger',
    ['config'],
    (config) => {
        _.forOwn(config.logging, (value, key) => {
            winston.loggers.add(key, value);
        });

        let logger = winston.loggers.get('default');

        console.debug = logger.debug;
        console.log = logger.info;
        console.error = logger.error;

        logger.cli();

        return logger;
    }
);

di.register(
    'db',
    ['config'],
    (config) => {
        return knex(config.db);
    }
);

di.register(
    'server',
    ['config'],
    (config) => {
        return pipeline(
            [
                (context) => {
                    context.server = express();
                    context.router = express.Router();

                    context.server.use(expressBodyParser.urlencoded({ extended: false }));
                    context.server.use(expressBodyParser.json());
                    context.server.use(expressCors());
                    context.server.use(context.router);

                    return context;
                },

                (context) => {
                    return when.promise((resolve, reject) => {
                        glob(
                            __dirname + '/controller/**/*',
                            {
                                nodir: true
                            },
                            (error, controllers) => {
                                if (!controllers) {
                                    return reject(new Error('No controllers specified.'));
                                }

                                resolve(controllers);
                            }
                        );
                    })
                    .then((controllers) => {
                        return keys.all(_.reduce(
                            controllers,
                            (result, controller) => {
                                result[controller] = require(controller)(di);
                                return result;
                            },
                            {}
                        ));
                    })
                    .then((controllers) => {
                        _.forEach(controllers, (controllerRouter, controller) => {
                            let
                                controllerPath = path.dirname(
                                    controller.replace(__dirname + '/controller', '')
                                );

                            context.router.use(controllerPath, controllerRouter);
                        });

                        return context;
                    });
                }
            ],
            {
                server: null,
                router: null
            }
        )
        .then((context) => {
            return context.server;
        });
    }
);

export default di;
