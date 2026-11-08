export function PublicationStatus({ published, hasChanges = false }: { published: boolean; hasChanges?: boolean }) {
  return <span className="platform-status" data-state={!published ? 'draft' : hasChanges ? 'changes' : 'published'}>
    {!published ? 'Черновик' : hasChanges ? 'Опубликовано · есть изменения' : 'Опубликовано'}
  </span>
}
