// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IPropertyTemplate, OrgRelation, orgRelationsNeedingProperty} from '../../blocks/board'

// Which card property a relation reads, and what to fall back on when the row
// names none.
//
// The matrix has answered this since it existed (accessMatrix.orgPropertyFor):
// the division relations read a 본부 property, the department one and 본인 read
// 부서. 본인 counts because "my card" asks who owns it and where it sits at once
// — drop the organisation and authoring a card is enough to reach any team's
// Tasks. The rule editor has to answer it the same way, or the same row means
// different things depending on which screen made it.
//
// The server refuses a relation naming no property, and it checks the whole rule
// set at once, so one such row blocks every other edit on the board. Answering
// here is what keeps that from happening.
export function orgPropertyForRelation(
    relation: OrgRelation,
    cardProperties: IPropertyTemplate[],
    current = '',
): string {
    if (!orgRelationsNeedingProperty.includes(relation)) {
        return ''
    }

    const wanted = relation === 'sameDivision' || relation === 'otherDivision' ? 'orgDivision' : 'orgDepartment'
    const matching = cardProperties.filter((property) => property.type === wanted)

    // Whatever the row already names is kept when it is of the right kind — the
    // admin may have picked deliberately among several.
    if (matching.some((property) => property.id === current)) {
        return current
    }

    return matching.length > 0 ? matching[0].id : ''
}
