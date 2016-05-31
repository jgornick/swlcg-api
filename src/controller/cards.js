import _ from 'lodash';
import when from 'when';
import express from 'express';
import JsonApiQueryParser from 'jsonapi-query-parser';
import CardJsonApiSerializer from '../serializer/card';
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
                            .select(
                                'number'
                            )
                            .from('cards'),
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

                    cardsSql.select(cardsSqlFields);

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
                            res.send(CardJsonApiSerializer.serialize(results));
                        })
                        .catch((error) => {
                            res.status(500).send(error);
                        });
                }
            );

            router.get(
                '/cards/:number',
                (req, res) => {
                    res.sendStatus(200);
                }
            );

            router.get(
                '/cards/:number/objective-sets',
                (req, res) => {
                    res.sendStatus(200);
                }
            );

            return router;
        });
};
