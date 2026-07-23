import type { Conference, Journal } from "@/lib/types";

function hasText(value: string | string[] | undefined | null) {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }

  return typeof value === "string" && value.trim().length > 0;
}

export function isNonEmptyJournal(journal: Journal) {
  return [
    journal.doi,
    journal.date,
    journal.author,
    journal.applicantAuthorName,
    journal.doiAuthorNames,
    journal.issns,
    journal.title,
    journal.journal,
    journal.reviewUnit,
    journal.authorOrder,
    journal.attachmentNote,
  ].some(hasText);
}

export function isNonEmptyConference(conference: Conference) {
  return [
    conference.date,
    conference.author,
    conference.title,
    conference.conference,
    conference.organizer,
    conference.authorOrder,
  ].some(hasText);
}

export function getNonEmptyJournals(journals: Journal[] | undefined | null) {
  return (journals ?? []).filter(isNonEmptyJournal);
}

export function getNonEmptyConferences(
  conferences: Conference[] | undefined | null
) {
  return (conferences ?? []).filter(isNonEmptyConference);
}

export function getIndexedNonEmptyJournals(
  journals: Journal[] | undefined | null
) {
  return (journals ?? [])
    .map((journal, index) => ({ journal, index }))
    .filter(({ journal }) => isNonEmptyJournal(journal));
}

export function getIndexedNonEmptyConferences(
  conferences: Conference[] | undefined | null
) {
  return (conferences ?? [])
    .map((conference, index) => ({ conference, index }))
    .filter(({ conference }) => isNonEmptyConference(conference));
}
