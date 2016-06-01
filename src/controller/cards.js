import _ from 'lodash';
import async from 'async-p';
import when from 'when';
import express from 'express';
import JsonApiQueryParser from 'jsonapi-query-parser';
import CardJsonApiSerializer from '../serializer/card';
import ObjectiveSetJsonApiSerializer from '../serializer/objective-set';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

export default function(di) {
    return di.resolve(['db'])
        .then(({ db }) => {
            let
                router = express.Router();

            router.get(
                '/cards',
                (req, res) => {
                    let
                        cardsSql = db
                            .distinct()
                            .select('number as id')
                            .from('cards'),
                        objectiveSetsSql = db
                            .select('objective_set_number as id')
                            .from('cards')
                            .where('objective_set_sequence', 1)
                            .orderBy('objective_set_number', 'asc'),
                        objectiveSetSqlFields = [],
                        cardsSqlFields = [];

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = _.mapKeys(query.fields, (value, key) => _.camelCase(key));
                    query.page.offset = query.page.offset == null ? 0 : query.page.offset;
                    query.page.limit = query.page.limit == null ? 10 : query.page.limit;
                    query.sort = query.sort.length == 0 ? ['number'] : query.sort;

                    if (_.size(_.result(query.fields, 'cards', {}))) {
                        cardsSqlFields = _.map(query.fields.cards, _.snakeCase);
                    }

                    if (_.size(_.result(query.fields, 'objectiveSets', {}))) {
                        objectiveSetSqlFields = _.map(query.fields.objectiveSets, _.snakeCase);
                    }

                    if (!objectiveSetSqlFields.length) {
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS;
                    }

                    if (!cardsSqlFields.length) {
                        cardsSqlFields = CARD_SQL_FIELDS;
                    }

                    _.pull(cardsSqlFields, ...[
                        'objective_set_number',
                        'objective_set_sequence',
                        'product',
                        'product_cycle'
                    ]);

                    cardsSql.select(cardsSqlFields);
                    objectiveSetsSql.select(objectiveSetSqlFields);

                    if (req.query.filter != null) {
                        cardsSql.andWhere('title', 'ilike', `%${req.query.filter}%`);
                    }

                    if (query.sort != null) {
                        query.sort.forEach((field) => {
                            const
                                direction = /^-/.test(field) ? 'desc' : 'asc';

                            field = _.snakeCase(field.replace(/^-/, ''));

                            cardsSql.orderBy(field, direction);
                        });
                    }

                    if (query.page.offset != null) {
                        cardsSql.offset(query.page.offset);
                    }

                    if (query.page.limit != null) {
                        cardsSql.limit(query.page.limit);
                    }

                    cardsSql
                        .then((results) => {
                            return async.each(results, (card) => {
                                return objectiveSetsSql.clone()
                                    .whereIn('objective_set_number', (where) => {
                                        where
                                            .select('objective_set_number')
                                            .from('cards')
                                            .where('number', card.number);
                                    })
                                    .then((results) => {
                                        card.objectiveSets = results;
                                        return card;
                                    });
                            });
                        })
                        .then((results) => {
                            res.send(CardJsonApiSerializer.serialize(results, {
                                attributes: [
                                    ...cardsSqlFields,
                                    'objectiveSets'
                                ],
                                objectiveSets: {
                                    attributes: objectiveSetSqlFields,
                                    included: _.includes(query.include, 'objectiveSets')
                                }
                            }));
                        })
                        .catch((error) => {
                            res.status(500).send(error);
                        });
                }
            );

            router.get(
                '/cards/:objectiveSetNumber-:objectiveSetSequence',
                (req, res) => {
                    let
                        cardsSql = db
                            .select('number')
                            .from('cards')
                            .where('objective_set_number', req.params.objectiveSetNumber)
                            .andWhere('objective_set_sequence', req.params.objectiveSetSequence);

                    cardsSql.first().then(({ number }) => res.redirect(301, `/cards/${number}`));
                }
            );

            router.get(
                '/cards/:number',
                (req, res) => {
                    let
                        cardsSql = db
                            .distinct()
                            .select('number as id')
                            .from('cards')
                            .where('number', req.params.number),
                        objectiveSetsSql = db
                            .select('objective_set_number as id')
                            .from('cards')
                            .where('objective_set_sequence', 1)
                            .orderBy('objective_set_number', 'asc'),
                        objectiveSetSqlFields = [],
                        cardsSqlFields = [];

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = _.mapKeys(query.fields, (value, key) => _.camelCase(key));

                    if (_.size(_.result(query.fields, 'cards', {}))) {
                        cardsSqlFields = _.map(query.fields.cards, _.snakeCase);
                    }

                    if (_.size(_.result(query.fields, 'objectiveSets', {}))) {
                        objectiveSetSqlFields = _.map(query.fields.objectiveSets, _.snakeCase);
                    }

                    if (!objectiveSetSqlFields.length) {
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS;
                    }

                    if (!cardsSqlFields.length) {
                        cardsSqlFields = CARD_SQL_FIELDS;
                    }

                    _.pull(cardsSqlFields, ...[
                        'objective_set_number',
                        'objective_set_sequence',
                        'product',
                        'product_cycle'
                    ]);

                    cardsSql.select(_.uniq(['number', ...cardsSqlFields]));
                    objectiveSetsSql.select(_.uniq(['objective_set_number', ...objectiveSetSqlFields]));

                    cardsSql
                        .first()
                        .then((card) => {
                            return objectiveSetsSql.clone()
                                .whereIn('objective_set_number', (where) => {
                                    where
                                        .select('objective_set_number')
                                        .from('cards')
                                        .where('number', card.number);
                                })
                                .then((results) => {
                                    card.objectiveSets = results;
                                    return card;
                                });
                        })
                        .then((card) => {
                            res.send(CardJsonApiSerializer.serialize(card, {
                                topLevelLinks: {
                                    self: (record) => `/cards/${card.id}`
                                },
                                attributes: [
                                    ...cardsSqlFields,
                                    'objectiveSets'
                                ],
                                objectiveSets: {
                                    attributes: [
                                        ...objectiveSetSqlFields
                                    ],
                                    included: _.includes(query.include, 'objectiveSets')
                                }
                            }));
                        })
                        .catch((error) => {
                            res.status(500).send(error);
                        });
                }
            );

            router.get(
                '/cards/:number/objective-sets',
                (req, res) => {
                    let
                        objectiveSetsSql = db
                            .select('objective_set_number as id')
                            .from('cards')
                            .where('objective_set_sequence', 1)
                            .whereIn('objective_set_number', (where) => {
                                where
                                    .select('objective_set_number')
                                    .from('cards')
                                    .where('number', req.params.number);
                            })
                            .orderBy('objective_set_number', 'asc'),
                        objectiveSetSqlFields = [];

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = _.mapKeys(query.fields, (value, key) => _.camelCase(key));
                    query.page.offset = query.page.offset == null ? 0 : query.page.offset;
                    query.page.limit = query.page.limit == null ? 10 : query.page.limit;
                    query.sort = query.sort.length == 0 ? ['objective_set_number'] : query.sort;

                    if (_.size(_.result(query.fields, 'objectiveSets', {}))) {
                        objectiveSetSqlFields = _.map(query.fields.objectiveSets, _.snakeCase);
                    }

                    if (!objectiveSetSqlFields.length) {
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS;
                    }

                    objectiveSetsSql.select(_.uniq([
                        'objective_set_number',
                        ...objectiveSetSqlFields
                    ]));

                    if (req.query.filter != null) {
                        objectiveSetsSql.andWhere('title', 'ilike', `%${req.query.filter}%`);
                    }

                    if (query.sort != null) {
                        query.sort.forEach((field) => {
                            const
                                direction = /^-/.test(field) ? 'desc' : 'asc';

                            field = _.snakeCase(field.replace(/^-/, ''));

                            objectiveSetsSql.orderBy(field, direction);
                        });
                    }

                    if (query.page.offset != null) {
                        objectiveSetsSql.offset(query.page.offset);
                    }

                    if (query.page.limit != null) {
                        objectiveSetsSql.limit(query.page.limit);
                    }

                    objectiveSetsSql
                        .then((results) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(results, {
                                topLevelLinks: {
                                    self: `/cards/${req.params.number}/objective-sets`
                                },
                                attributes: objectiveSetSqlFields
                            }));
                        })
                        .catch((error) => {
                            res.status(500).send(error);
                        });
                }
            );

            return router;
        });
};
