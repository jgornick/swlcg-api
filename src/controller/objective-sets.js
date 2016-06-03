import _ from 'lodash';
import async from 'async-p';
import when from 'when';
import express from 'express';
import JsonApiQueryParser from 'jsonapi-query-parser';
import ObjectiveSetJsonApiSerializer from '../serializer/objective-set';
import CardJsonApiSerializer from '../serializer/card';
import { SQL_FIELDS as OBJECTIVE_SET_SQL_FIELDS } from '../struct/objective-set';
import { SQL_FIELDS as CARD_SQL_FIELDS } from '../struct/card';
import * as util from '../util/controller';

export default function(di) {
    return di.resolve(['db'])
        .then(({ db }) => {
            let
                router = express.Router();

            router.get(
                '/objective-sets',
                (req, res) => {
                    let
                        objectiveSetMatchesSql = db
                            .select(
                                'oc.objective_set_number',
                                db.raw(`array_agg(distinct cc.number) as matched_cards`),
                                db.raw(`count(oc.objective_set_number) as objective_set_count`)
                            )
                            .from('cards as oc')
                            .join('cards as cc', 'cc.objective_set_number', 'oc.objective_set_number')
                            .where('oc.objective_set_sequence', 1)
                            .groupBy('oc.objective_set_number'),
                        objectiveSetsSql = db
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
                        objectiveSetMatchesSql.andWhere('cc.title', 'ilike', `%${req.query.filter}%`);
                    }

                    objectiveSetsSql.from(db.raw(`(${objectiveSetMatchesSql.toString()}) as mos`));

                    query.fields = util.normalizeQueryFields(query.fields);

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

                    objectiveSetsSql.modify(
                        util.withFields,
                        util.prefixSqlFields('oc', objectiveSetSqlFields),
                        util.prefixSqlFields('oc', OBJECTIVE_SET_SQL_FIELDS)
                    );

                    cardsSql.modify(
                        util.withFields,
                        cardSqlFields,
                        CARD_SQL_FIELDS
                    );

                    objectiveSetsSql.modify(
                        util.withSort,
                        util.prefixSortFields(
                            'oc',
                            util.normalizeSortFields(_.result(query, 'sort', []))
                        ),
                        ['objective_set_number']
                    );

                    objectiveSetsSql.modify(
                        util.withPagination,
                        _.result(query.page, 'offset', 0),
                        _.result(query.page, 'limit', 10)
                    );

                    objectiveSetsSql
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
                                return util.includeObjectiveSetMetrics(db, results);
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
                        objectiveSetsSql = db
                            .select('objective_set_number as id')
                            .from('cards')
                            .where('objective_set_number', req.params.number)
                            .andWhere('objective_set_sequence', 1)
                            .orderBy('objective_set_number', 'asc'),
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

                    query.fields = util.normalizeQueryFields(query.fields);

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

                    objectiveSetsSql.modify(
                        util.withFields,
                        objectiveSetSqlFields,
                        OBJECTIVE_SET_SQL_FIELDS
                    );

                    cardsSql.modify(
                        util.withFields,
                        cardSqlFields,
                        CARD_SQL_FIELDS
                    );

                    objectiveSetsSql
                        .first()
                        .then((objectiveSet) => {
                            return cardsSql.clone()
                                .where('objective_set_number', objectiveSet.objective_set_number)
                                .then((results) => {
                                    objectiveSet.cards = results;
                                    return objectiveSet;
                                });
                        })
                        .then((objectiveSet) => {
                            if (_.includes(objectiveSetAttributeFields, 'metrics')) {
                                return util.includeObjectiveSetMetrics(db, [objectiveSet])
                                    .then((objectiveSets) => _.first(objectiveSets));
                            }

                            return results;
                        })
                        .then((objectiveSet) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(objectiveSet, {
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

                    query.fields = util.normalizeQueryFields(query.fields);

                    if (_.size(_.result(query.fields, 'cards', []))) {
                        cardSqlFields =
                        cardAttributeFields = query.fields.cards;
                    }

                    cardsSql.modify(
                        util.withFields,
                        cardSqlFields,
                        CARD_SQL_FIELDS
                    );

                    cardsSql.modify(
                        util.withSort,
                        util.normalizeSortFields(_.result(query, 'sort', [])),
                        ['objective_set_sequence']
                    );

                    cardsSql.modify(
                        util.withPagination,
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
