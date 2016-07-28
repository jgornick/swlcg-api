import _ from 'lodash';
import async from 'async-p';
import when from 'when';
import express from 'express';
import JsonApiQueryParser from 'jsonapi-query-parser';
import CardJsonApiSerializer from '../serializer/card';
import ObjectiveSetJsonApiSerializer from '../serializer/objective-set';
import * as util from '../util/controller';

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
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS,
                        objectiveSetAttributeFields = OBJECTIVE_SET_SQL_FIELDS,
                        defaultCardSqlFields = _.without(
                            CARD_SQL_FIELDS,
                            'objective_set_number',
                            'objective_set_sequence',
                            'product',
                            'product_cycle'
                        ),
                        cardSqlFields = defaultCardSqlFields,
                        cardAttributeFields = defaultCardSqlFields;

                    let
                        parser = new JsonApiQueryParser(),
                        query = parser.parseRequest(req.url).queryData,
                        offset = +_.result(query.page, 'offset', 0),
                        limit = +_.result(query.page, 'limit', 10);

                    if (req.query.filter != null) {
                        cardsSql.andWhere('title', 'ilike', `%${req.query.filter}%`);
                    }

                    query.fields = util.normalizeQueryFields(query.fields);
                    query.include = util.normalizeQueryIncludes(query.include);

                    if (_.size(_.result(query.fields, 'cards', []))) {
                        cardSqlFields =
                        cardAttributeFields = _.without(
                            query.fields.cards,
                            'objective_set_number',
                            'objective_set_sequence',
                            'product',
                            'product_cycle'
                        );
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
                        defaultCardSqlFields
                    );

                    cardsSql.modify(
                        util.withSort,
                        util.normalizeSortFields(_.result(query, 'sort', []))
                        ['objective_set_number']
                    );

                    cardsSql.modify(
                        util.withPagination,
                        offset,
                        limit
                    );

                    when.all([
                        cardsSql,
                        db
                            .count('number as count')
                            .from(
                                db.raw(
                                    cardsSql
                                        .clone()
                                        .offset()
                                        .limit(Math.pow(10,10))
                                )
                                .wrap('(', ') as c')
                            )
                    ])
                        .then(([results, counts]) => {
                            let
                                count = _.result(_.first(counts), 'count', 0);

                            return async.each(results, (card) => {
                                card.total_count = count;
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
                            let
                                count = +_.result(_.first(results), 'total_count', 0);

                            res.send(CardJsonApiSerializer.serialize(
                                results,
                                util.withPaginationLinks(
                                    util.calculatePaginationOffsets(offset, limit, count),
                                    req.url,
                                    {
                                        attributes: [
                                            ...cardAttributeFields,
                                            'objectiveSets'
                                        ],
                                        objectiveSets: {
                                            attributes: objectiveSetAttributeFields,
                                            included: _.includes(query.include, 'objectiveSets')
                                        }
                                    }
                                )
                            ));
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
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS,
                        objectiveSetAttributeFields = OBJECTIVE_SET_SQL_FIELDS,
                        defaultCardSqlFields = _.without(
                            CARD_SQL_FIELDS,
                            'objective_set_number',
                            'objective_set_sequence',
                            'product',
                            'product_cycle'
                        ),
                        cardSqlFields = defaultCardSqlFields,
                        cardAttributeFields = defaultCardSqlFields;

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    query.fields = util.normalizeQueryFields(query.fields);
                    query.include = util.normalizeQueryIncludes(query.include);

                    if (_.size(_.result(query.fields, 'cards', []))) {
                        cardSqlFields =
                        cardAttributeFields = _.without(
                            query.fields.cards,
                            'objective_set_number',
                            'objective_set_sequence',
                            'product',
                            'product_cycle'
                        );
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
                        defaultCardSqlFields
                    );

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
                                    ...cardAttributeFields,
                                    'objectiveSets'
                                ],
                                objectiveSets: {
                                    attributes: objectiveSetAttributeFields,
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
                        objectiveSetSqlFields = OBJECTIVE_SET_SQL_FIELDS,
                        objectiveSetAttributeFields = [
                            ...OBJECTIVE_SET_SQL_FIELDS,
                            'metrics',
                            'mapped_cards'
                        ];

                    let parser = new JsonApiQueryParser();
                    let query = parser.parseRequest(req.url).queryData;

                    if (req.query.filter != null) {
                        objectiveSetsSql.andWhere('title', 'ilike', `%${req.query.filter}%`);
                    }

                    query.fields = util.normalizeQueryFields(query.fields);

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

                    objectiveSetsSql.modify(
                        util.withSort,
                        util.normalizeSortFields(_.result(query, 'sort', []))
                        ['objective_set_number']
                    );

                    objectiveSetsSql
                        .then((results) => {
                            res.send(ObjectiveSetJsonApiSerializer.serialize(results, {
                                topLevelLinks: {
                                    self: `/cards/${req.params.number}/objective-sets`
                                },
                                attributes: objectiveSetAttributeFields
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
