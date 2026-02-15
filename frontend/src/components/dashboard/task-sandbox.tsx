"use client";

import { FormEvent, useState } from "react";
import { Loader2, Play, Search } from "lucide-react";

import { createTask, getTask } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TaskSandbox() {
  const [message, setMessage] = useState("uart: ping");
  const [taskId, setTaskId] = useState("");
  const [response, setResponse] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      const result = await createTask(message);
      setTaskId(result.id);
      setResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof ApiError) {
        setResponse(`error ${error.status}: ${error.detail}`);
      } else {
        setResponse("error: unexpected failure while creating task");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleFetchTask = async () => {
    if (!taskId) {
      setResponse("set task id first");
      return;
    }

    setIsFetching(true);
    try {
      const task = await getTask(taskId);
      setResponse(JSON.stringify(task, null, 2));
    } catch (error) {
      if (error instanceof ApiError) {
        setResponse(`error ${error.status}: ${error.detail}`);
      } else {
        setResponse("error: unexpected failure while fetching task");
      }
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background task sandbox</CardTitle>
        <CardDescription>Uses `/api/v1/tasks/task` endpoints to validate backend queue connectivity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={handleCreateTask}>
          <div className="space-y-2">
            <Label htmlFor="task-message">Message</Label>
            <Textarea
              id="task-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="uart: hello"
            />
          </div>

          <Button type="submit" disabled={isCreating}>
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Create task
          </Button>
        </form>

        <div className="space-y-2">
          <Label htmlFor="task-id">Task ID</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="task-id" value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="job id" />
            <Button type="button" variant="secondary" onClick={handleFetchTask} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Get task
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border/70 bg-secondary/35 p-3">
          <pre className="overflow-auto text-xs text-muted-foreground">{response || "response will appear here"}</pre>
        </div>
      </CardContent>
    </Card>
  );
}
