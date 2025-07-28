import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { importListFromLink } from '@/lib/utils';
import { ListPreviewCard } from "@/components/ListPreviewCard";
import { colors } from "@/lib/colors";

export default function ImportListPrompt() {
  const navigate = useNavigate();
  const location = useLocation();
  const [importData, setImportData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Parse and preview the import data from the link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dataParam = params.get('data');
    if (!dataParam) {
      setError('No import data found in the link.');
      return;
    }
    try {
      const json = atob(decodeURIComponent(dataParam));
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || !parsed.name || !parsed.color) {
        setError('Invalid or incomplete todo list data.');
        return;
      }
      setImportData(parsed);
    } catch (e: any) {
      setError('Failed to decode the todo list. The link may be invalid or corrupted.');
    }
  }, [location.search]);

  const handleImport = async () => {
    if (!importData) return;
    setImporting(true);
    setError(null);
    try {
      // Reconstruct the import link for importListFromLink
      const importUrl = `${window.location.origin}/import?data=${encodeURIComponent(btoa(JSON.stringify(importData)))}`;
      const newId = await importListFromLink(importUrl);
      if (!newId) throw new Error('Failed to import the todo list.');
      navigate(`/list/${newId}`);
    } catch (e: any) {
      setError('Failed to import the todo list.');
    } finally {
      setImporting(false);
    }
  };

  const handleCancel = () => {
    navigate('/list');
  };

  return (
    <Dialog open={true} onOpenChange={handleCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Todo List</DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="text-red-500 text-sm mb-4">{error}</div>
        ) : importData ? (
          <>
            <DialogDescription>
              Do you want to add the following todo list to your account?
            </DialogDescription>
            <div className="my-4 flex justify-center">
              <ListPreviewCard
                name={importData.name}
                color={colors.find(c => c.name === importData.color) || colors[1]}
                todos={importData.todos || []}
              />
            </div>
          </>
        ) : (
          <div>Loading…</div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={!importData || importing || !!error}>
            {importing ? 'Importing…' : 'Import List'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
