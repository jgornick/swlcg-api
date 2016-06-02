import _ from 'lodash';
import async from 'async-p';
import when from 'when';
import express from 'express';
import JsonApiQueryParser from 'jsonapi-query-parser';
import ObjectiveSetJsonApiSerializer from '../serializer/objective-set';
import CardJsonApiSerializer from '../serializer/card';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';

function withPagination(query, offset = 0, limit = 10) {
    query
        .offset(offset)
        .limit(limit);
}

function withSort(query, fields = [], defaultFields = []) {
    _.each(
        fields.length ? fields : defaultFields,
        (field) => {
            let direction = /^-/.test(field) ? 'desc' : 'asc';
            field = _.snakeCase(field.replace(/^-/, ''));
            query.orderBy(field, direction);
        }
    );
}

function withFields(query, fields = [], defaultFields = []) {
    if (_.size(fields)) {
        query.select(fields);
    } else {
        query.select(defaultFields);
    }
}

function prefixSqlFields(prefix, fields = []) {
    return _.map(fields, (value) => `${prefix}.${value}`);
}

function normalizeSortFields(fields = []) {
    return _.map(fields, (field) => (
        (/^-/.test(field) ? '-' : '')
        + _.snakeCase(field.replace(/^-/, ''))
    ));
}

function prefixSortFields(prefix, fields = []) {
    prefix = _.trim(prefix);

    if (prefix == '') {
        return fields;
    }

    return _.map(fields, (field) => (
        (/^-/.test(field) ? '-' : '')
        + `${prefix}${field.replace(/^-/, '')}`
    ));
}

function normalizeQueryFields(fields = {}) {
    return _.mapValues(
        _.mapKeys(fields, (value, key) => _.camelCase(key)),
        (value) => _.map(value, _.snakeCase)
    );
}

function normalizeObjectiveSetMetrics(metrics) {
    return _.map(metrics, (value) => {
        value.average = +value.average;
        value.name = _.camelCase(value.name);
        return value;
    });
}

function includeObjectiveSetMetrics(db, objectiveSetResults) {
    let
        objectiveSetMetricsSql = db
            .select('name', 'count', 'sum', 'average', 'min', 'max')
            .from('objective_set_metrics')
            .orderBy('name', 'asc'),
        objectiveSetCardTypeMetricsSql = db
            .select('type', 'name', 'count', 'sum', 'average', 'min', 'max')
            .from('objective_set_card_type_metrics')
            .orderBy('name', 'asc');

    return when.all([
        async.each(objectiveSetResults, (objectiveSet) => {
            return objectiveSetMetricsSql.clone()
                .where('objective_set_number', objectiveSet.objective_set_number)
                .then((results) => {
                    objectiveSet.metrics = _.merge(
                        objectiveSet.metrics || {},
                        { objective: normalizeObjectiveSetMetrics(results) }
                    );
                    return objectiveSet;
                });
        }),
        async.each(objectiveSetResults, (objectiveSet) => {
            return objectiveSetCardTypeMetricsSql.clone()
                .where('objective_set_number', objectiveSet.objective_set_number)
                .then((results) => {
                    objectiveSet.metrics = _.merge(
                        objectiveSet.metrics || {},
                        { type: normalizeObjectiveSetMetrics(results) }
                    );
                    return objectiveSet;
                });
        })
    ])
        .then(() => objectiveSetResults);
}

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
                                db.raw(`array_agg(distinct cc.number) as matched_cards`),
                                db.raw(`count(oc.objective_set_number) as objective_set_count`)
                            )
                            .from('cards as oc')
                            .join('cards as cc', 'cc.objective_set_number', 'oc.objective_set_number')
                            .where('oc.objective_set_sequence', 1)
                            .groupBy('oc.objective_set_number'),
                        objectiveSetSql = db
                            .select(
                                'oc.objective_set_number as id',
                                'oc.objective_set_number',
                                'mos.matched_cards',
                                'mos.objective_set_count'
                            )
                            .join('cards as oc', (join) => {
                                join
                                    .on('oc.objective_set_number', '=', 'mos.objective_set_number')
                                    .andOn('oc.objective_set_sequence', 1)
                            }),
                        cardsSql = db
                            .select(db.raw(`concat_ws('-', objective_set_number, objective_set_sequence) as id`))
                            .from('cards')
                            .orderBy('objective_set_sequence', 'asc'),
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS,
                        objectiveSetAttributeFields = [
                            ...OBJECTIVE_SET_SQL_FIELDS,
                            'metrics',
                            'mapped_cards'
                        ],
                        cardSqlFields = CARD_SQL_FIELDS,
                        cardAttributeFields = CARD_SQL_FIELDS;

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    if (req.query.filter != null) {
                        objectiveSetMatchSql.andWhere('cc.title', 'ilike', `%${req.query.filter}%`);
                    }

                    objectiveSetSql.from(db.raw(`(${objectiveSetMatchSql.toString()}) as mos`));

                    query.fields = normalizeQueryFields(query.fields);

                    if (_.size(_.result(query.fields, 'cards', []))) {
                        cardSqlFields =
                        cardAttributeFields = query.fields.cards;
                    }

                    if (_.size(_.result(query.fields, 'objectiveSets', []))) {
                        objectiveSetSqlFields = _.without(
                            query.fields.objectiveSets,
                            'metrics',
                            'matched_cards'
                        );
                        objectiveSetAttributeFields = query.fields.objectiveSets;
                    }

                    objectiveSetSql.modify(
                        withFields,
                        prefixSqlFields('oc', objectiveSetSqlFields),
                        prefixSqlFields('oc', OBJECTIVE_SET_SQL_FIELDS)
                    );

                    cardsSql.modify(
                        withFields,
                        cardSqlFields,
                        CARD_SQL_FIELDS
                    );

                    objectiveSetSql.modify(
                        withSort,
                        prefixSortFields('oc', normalizeSortFields(_.result(query, 'sort', []))),
                        ['objective_set_number']
                    );

                    objectiveSetSql.modify(
                        withPagination,
                        _.result(query.page, 'offset', 0),
                        _.result(query.page, 'limit', 10)
                    );

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
                            if (_.includes(objectiveSetAttributeFields, 'metrics')) {
                                return includeObjectiveSetMetrics(db, results);
                            }

                            return results;
                        })
                        .then((results) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(results, {
                                attributes: [
                                    ...objectiveSetAttributeFields,
                                    'cards'
                                ],
                                cards: {
                                    attributes: cardAttributeFields,
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
                            .andWhere('objective_set_sequence', 1)
                            .orderBy('objective_set_number', 'asc'),
                        cardsSql = db
                            .select(db.raw(`concat_ws('-', objective_set_number, objective_set_sequence) as id`))
                            .from('cards'),
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS,
                        objectiveSetAttributeFields = [
                            ...OBJECTIVE_SET_SQL_FIELDS,
                            'metrics',
                            'mapped_cards'
                        ],
                        cardSqlFields = CARD_SQL_FIELDS,
                        cardAttributeFields = CARD_SQL_FIELDS;

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = normalizeQueryFields(query.fields);

                    if (_.size(_.result(query.fields, 'cards', []))) {
                        cardSqlFields =
                        cardAttributeFields = query.fields.cards;
                    }

                    if (_.size(_.result(query.fields, 'objectiveSets', []))) {
                        objectiveSetSqlFields = _.without(
                            query.fields.objectiveSets,
                            'metrics',
                            'matched_cards'
                        );
                        objectiveSetAttributeFields = query.fields.objectiveSets;
                    }

                    objectiveSetSql.modify(
                        withFields,
                        objectiveSetSqlFields,
                        OBJECTIVE_SET_SQL_FIELDS
                    );

                    cardsSql.modify(
                        withFields,
                        cardSqlFields,
                        CARD_SQL_FIELDS
                    );

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
                            if (_.includes(objectiveSetAttributeFields, 'metrics')) {
                                return includeObjectiveSetMetrics(db, results);
                            }

                            return results;
                        })
                        .then((results) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(results, {
                                attributes: [
                                    ...objectiveSetAttributeFields,
                                    'cards'
                                ],
                                cards: {
                                    attributes: cardAttributeFields,
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
                        cardSqlFields = CARD_SQL_FIELDS,
                        cardAttributeFields = CARD_SQL_FIELDS;

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    if (req.query.filter != null) {
                        cardsSql.andWhere('title', 'ilike', `%${req.query.filter}%`);
                    }

                    query.fields = normalizeQueryFields(query.fields);

                    if (_.size(_.result(query.fields, 'cards', []))) {
                        cardSqlFields =
                        cardAttributeFields = query.fields.cards;
                    }

                    cardsSql.modify(
                        withFields,
                        cardSqlFields,
                        CARD_SQL_FIELDS
                    );

                    cardsSql.modify(
                        withSort,
                        normalizeSortFields(_.result(query, 'sort', [])),
                        ['objective_set_sequence']
                    );

                    cardsSql.modify(
                        withPagination,
                        _.result(query.page, 'offset', 0),
                        _.result(query.page, 'limit', 10)
                    );

                    cardsSql
                        .then((results) => {
                            res.send(CardJsonApiSerializer.serialize(results, {
                                topLevelLinks: {
                                    self: `/objective-sets/${req.params.number}/cards`
                                },
                                attributes: cardAttributeFields
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
