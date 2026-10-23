#!/usr/bin/env bash
# Read-only DB check for the acceptance account after a save-protocol run.
#   bash db-check.sh <artifact_id> <since ISO timestamp>
# Prints: revisions of the artifact created since <since>, and every acceptance-account root
# created since <since> (title, type, editorInternal) so stray library entries are visible.
set -euo pipefail
ART="$1"; SINCE="$2"
ACC="('2ffeef37-102a-431b-b2c2-51c5675dba79','user:2ffeef37-102a-431b-b2c2-51c5675dba79')"
supabase-sql oceanleo "select (select count(*) from artifact_revisions where artifact_id='$ART') total_revisions, (select json_agg(json_build_object('ord',ordinal,'at',created_at,'digest',left(content_digest,12),'parent',left(parent_revision_id::text,8),'editor',editor_capability) order by ordinal) from artifact_revisions where artifact_id='$ART' and created_at >= '$SINCE') new_revisions, (select json_agg(json_build_object('id',left(r.id::text,8),'title',v.title,'type',v.artifact_type,'internal',v.metadata->>'editorInternal','at',r.created_at) order by r.created_at) from artifact_roots r join artifact_revisions v on v.id=r.current_revision_id where r.owner_principal_id in $ACC and r.created_at >= '$SINCE') new_roots"
