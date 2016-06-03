import _ from 'lodash';
import when from 'when';
import async from 'async-p';

export function withPagination(query, offset = 0, limit = 10) {
    query
        .offset(offset)
        .limit(limit);
}

export function withSort(query, fields = [], defaultFields = []) {
    _.each(
        fields.length ? fields : defaultFields,
        (field) => {
            let direction = /^-/.test(field) ? 'desc' : 'asc';
            field = _.snakeCase(field.replace(/^-/, ''));
            query.orderBy(field, direction);
        }
    );
}

export function withFields(query, fields = [], defaultFields = []) {
    if (_.size(fields)) {
        query.select(fields);
    } else {
        query.select(defaultFields);
    }
}

export function prefixSqlFields(prefix, fields = []) {
    return _.map(fields, (value) => `${prefix}.${value}`);
}

export function normalizeSortFields(fields = []) {
    return _.map(fields, (field) => (
        (/^-/.test(field) ? '-' : '')
        + _.snakeCase(field.replace(/^-/, ''))
    ));
}

export function prefixSortFields(prefix, fields = []) {
    prefix = _.trim(prefix);

    if (prefix == '') {
        return fields;
    }

    return _.map(fields, (field) => (
        (/^-/.test(field) ? '-' : '')
        + `${prefix}${field.replace(/^-/, '')}`
    ));
}

export function normalizeQueryFields(fields = {}) {
    return _.mapValues(
        _.mapKeys(fields, (value, key) => _.camelCase(key)),
        (value) => _.map(value, _.snakeCase)
    );
}

export function normalizeObjectiveSetMetrics(metrics) {
    return _.map(metrics, (value) => {
        value.average = +value.average;
        value.name = _.camelCase(value.name);
        return value;
    });
}

export function includeObjectiveSetMetrics(db, objectiveSetResults) {
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
