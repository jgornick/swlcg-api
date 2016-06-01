import _ from 'lodash';
import async from 'async-p';
import when from 'when';
import express from 'express';
import JsonApiQueryParser from 'jsonapi-query-parser';
import ObjectiveSetJsonApiSerializer from '../serializer/objective-set';
import CardJsonApiSerializer from '../serializer/card';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

export default function(di) {
    return di.resolve(['db'])
        .then(({ db }) => {
            let
                router = express.Router();

            router.get(
                '/objective-sets',
                (req, res) => {
                    let
                        objectiveSetMatchSql = db
                            .select(
                                'oc.objective_set_number',
                                db.raw(`array_agg(distinct cc.number) as matched_cards`)
                            )
                            .from('cards as oc')
                            .join('cards as cc', 'cc.objective_set_number', 'oc.objective_set_number')
                            .where('oc.objective_set_sequence', 1)
                            .groupBy('oc.objective_set_number'),
                        objectiveSetSql = db
                            .select(
                                'oc.objective_set_number as id',
                                'oc.objective_set_number',
                                'mos.matched_cards'
                            )
                            .join('cards as oc', (join) => {
                                join
                                    .on('oc.objective_set_number', '=', 'mos.objective_set_number')
                                    .andOn('oc.objective_set_sequence', 1)
                            }),
                        objectiveSetMetricsSql = db
                            .select('name', 'count', 'sum', 'average', 'min', 'max')
                            .from('objective_set_metrics')
                            .orderBy('name', 'asc'),
                        objectiveSetCardTypeMetricsSql = db
                            .select('type', 'name', 'count', 'sum', 'average', 'min', 'max')
                            .from('objective_set_card_type_metrics')
                            .orderBy('name', 'asc'),
                        cardsSql = db
                            .select(db.raw(`concat_ws('-', objective_set_number, objective_set_sequence) as id`))
                            .from('cards')
                            .orderBy('objective_set_sequence', 'asc'),
                        objectiveSetSqlFields = [],
                        cardsSqlFields = [];

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = _.mapKeys(query.fields, (value, key) => _.camelCase(key));
                    query.page.offset = query.page.offset == null ? 0 : query.page.offset;
                    query.page.limit = query.page.limit == null ? 10 : query.page.limit;
                    query.sort = query.sort.length == 0 ? ['objective_set_number'] : query.sort;

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

                    objectiveSetSql.select(_.map(objectiveSetSqlFields, (value) => `oc.${value}`));
                    cardsSql.select(cardsSqlFields);

                    if (req.query.filter != null) {
                        objectiveSetMatchSql.andWhere('cc.title', 'ilike', `%${req.query.filter}%`);
                    }

                    if (query.sort != null) {
                        query.sort.forEach((field) => {
                            const
                                direction = /^-/.test(field) ? 'desc' : 'asc';

                            field = _.snakeCase(field.replace(/^-/, ''));

                            objectiveSetSql.orderBy(`oc.${field}`, direction);
                        });
                    }

                    if (query.page.offset != null) {
                        objectiveSetSql.offset(query.page.offset);
                    }

                    if (query.page.limit != null) {
                        objectiveSetSql.limit(query.page.limit);
                    }

                    objectiveSetSql.from(db.raw(`(${objectiveSetMatchSql.toString()}) as mos`));

                    objectiveSetSql
                        .then((results) => {
                            return async.each(results, (objectiveSet) => {
                                return cardsSql.clone()
                                    .where('objective_set_number', objectiveSet.objective_set_number)
                                    .then((results) => {
                                        objectiveSet.cards = results;
                                        return objectiveSet;
                                    });
                            });
                        })
                        .then((results) => {
                            return async.each(results, (objectiveSet) => {
                                return objectiveSetMetricsSql.clone()
                                    .where('objective_set_number', objectiveSet.objective_set_number)
                                    .then((results) => {
                                        results = _.map(results, (value) => {
                                            value.average = +value.average;
                                            value.name = _.camelCase(value.name);
                                            return value;
                                        });
                                        objectiveSet.metrics = _.merge(objectiveSet.metrics || {}, { objective: results });
                                        return objectiveSet;
                                    });
                            });
                        })
                        .then((results) => {
                            return async.each(results, (objectiveSet) => {
                                return objectiveSetCardTypeMetricsSql.clone()
                                    .where('objective_set_number', objectiveSet.objective_set_number)
                                    .then((results) => {
                                        results = _.map(results, (value) => {
                                            value.average = +value.average;
                                            value.name = _.camelCase(value.name);
                                            return value;
                                        });
                                        objectiveSet.metrics = _.merge(objectiveSet.metrics || {}, { type: results });
                                        return objectiveSet;
                                    });
                            });
                        })
                        .then((results) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(results, {
                                attributes: [
                                    ...objectiveSetSqlFields,
                                    'metrics',
                                    'matched_cards',
                                    'cards'
                                ],
                                cards: {
                                    attributes: cardsSqlFields,
                                    included: _.includes(query.include, 'cards')
                                }
                            }));
                        })
                        .catch((error) => {
                            res.status(500).send(error.message);
                        });
                }
            );

            router.get(
                '/objective-sets/:number',
                (req, res) => {
                    let
                        objectiveSetSql = db
                            .select('objective_set_number as id')
                            .from('cards')
                            .where('objective_set_number', req.params.number)
                            .andWhere('objective_set_sequence', 1),
                        objectiveSetMetricsSql = db
                            .select('name', 'count', 'sum', 'average', 'min', 'max')
                            .from('objective_set_metrics')
                            .orderBy('name', 'asc'),
                        objectiveSetCardTypeMetricsSql = db
                            .select('type', 'name', 'count', 'sum', 'average', 'min', 'max')
                            .from('objective_set_card_type_metrics')
                            .orderBy('name', 'asc'),
                        cardsSql = db
                            .select(db.raw(`concat_ws('-', objective_set_number, objective_set_sequence) as id`))
                            .from('cards'),
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

                    objectiveSetSql.select(objectiveSetSqlFields);
                    cardsSql.select(cardsSqlFields);

                    objectiveSetSql
                        .then((results) => {
                            return async.each(results, (objectiveSet) => {
                                return cardsSql.clone()
                                    .where('objective_set_number', objectiveSet.objective_set_number)
                                    .then((results) => {
                                        objectiveSet.cards = results;
                                        return objectiveSet;
                                    });
                            });
                        })
                        .then((results) => {
                            return async.each(results, (objectiveSet) => {
                                return objectiveSetMetricsSql.clone()
                                    .where('objective_set_number', objectiveSet.objective_set_number)
                                    .then((results) => {
                                        results = _.map(results, (value) => {
                                            value.average = +value.average;
                                            value.name = _.camelCase(value.name);
                                            return value;
                                        });
                                        objectiveSet.metrics = _.merge(objectiveSet.metrics || {}, { objective: results });
                                        return objectiveSet;
                                    });
                            });
                        })
                        .then((results) => {
                            return async.each(results, (objectiveSet) => {
                                return objectiveSetCardTypeMetricsSql.clone()
                                    .where('objective_set_number', objectiveSet.objective_set_number)
                                    .then((results) => {
                                        results = _.map(results, (value) => {
                                            value.average = +value.average;
                                            value.name = _.camelCase(value.name);
                                            return value;
                                        });
                                        objectiveSet.metrics = _.merge(objectiveSet.metrics || {}, { type: results });
                                        return objectiveSet;
                                    });
                            });
                        })
                        .then((results) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(results, {
                                attributes: [
                                    ...objectiveSetSqlFields,
                                    'metrics',
                                    'cards'
                                ],
                                cards: {
                                    attributes: cardsSqlFields,
                                    included: _.includes(query.include, 'cards')
                                }
                            }));
                        })
                        .catch((error) => {
                            res.status(500).send(error.message);
                        });
                }
            );

            router.get(
                '/objective-sets/:number/cards',
                (req, res) => {
                    let
                        cardsSql = db
                            .select('number as id')
                            .from('cards')
                            .where('objective_set_number', req.params.number)
                            .orderBy('objective_set_sequence', 'asc'),
                        cardsSqlFields = [];

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = _.mapKeys(query.fields, (value, key) => _.camelCase(key));
                    query.page.offset = query.page.offset == null ? 0 : query.page.offset;
                    query.page.limit = query.page.limit == null ? 10 : query.page.limit;
                    query.sort = query.sort.length == 0 ? ['objective_set_number'] : query.sort;

                    if (_.size(_.result(query.fields, 'cards', {}))) {
                        cardsSqlFields = _.map(query.fields.cards, _.snakeCase);
                    }

                    if (!cardsSqlFields.length) {
                        cardsSqlFields = CARD_SQL_FIELDS;
                    }

                    cardsSql.select(cardsSqlFields);

                    if (req.query.filter != null) {
                        cardsSql.andWhere('title', 'ilike', `%${req.query.filter}%`);
                    }

                    if (query.sort != null) {
                        query.sort.forEach((field) => {
                            const
                                direction = /^-/.test(field) ? 'desc' : 'asc';

                            field = _.snakeCase(field.replace(/^-/, ''));

                            cardsSql.orderBy(`${field}`, direction);
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
                            res.send(CardJsonApiSerializer.serialize(results, {
                                topLevelLinks: {
                                    self: `/objective-sets/${req.params.number}/cards`
                                },
                                attributes: cardsSqlFields
                            }));
                        })
                        .catch((error) => {
                            res.status(500).send(error.message);
                        });
                }
            );

            return router;
        });
};
